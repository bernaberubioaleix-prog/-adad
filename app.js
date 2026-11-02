
(() => {
  const cfg = window.APP_CONFIG || {};
  const $ = id => document.getElementById(id);
  const loginView = $('loginView');
  const appView = $('appView');
  const dialog = $('entryDialog');
  const bucket = 'hunter-skins';

  const RANKS = [
    'LT5', 'HT5', 'LT4', 'HT4', 'LT3',
    'HT3', 'LT2', 'HT2', 'LT1', 'HT1'
  ];

  let db;
  let user;
  let entries = [];
  let editingId = null;
  let isAdmin = false;
  let isEditor = false;

  function message(id, text, error = false) {
    const el = $(id);
    if (!el) return;
    el.textContent = text;
    el.style.color = error ? '#e08b7d' : '';
  }

  function showLogin() {
    user = null;
    entries = [];
    isAdmin = false;
    isEditor = false;

    loginView.classList.remove('hidden');
    appView.classList.add('hidden');
    $('logoutBtn').classList.add('hidden');
  }

  async function loadPlayerRank() {
    if (!user) return;

    const { data, error } = await db
      .from('hunter_player_ratings')
      .select('elo, rank')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      message('statusMessage', 'No se pudo cargar el ELO: ' + error.message, true);
      return;
    }

    $('playerRank').textContent = data ? data.rank : 'HT5';
    $('playerElo').textContent = data ? data.elo : '1000';
  }

  async function enterApp(currentUser) {
    user = currentUser;

    loginView.classList.add('hidden');
    appView.classList.remove('hidden');
    $('logoutBtn').classList.remove('hidden');

    message('statusMessage', 'Comprobando permisos…');

    const { data: ownerRows, error: ownerError } = await db
      .from('hunter_entry_editors')
      .select('id')
      .eq('owner_id', user.id)
      .limit(1);

    const { data: editorRows, error: editorError } = await db
      .from('hunter_entry_editors')
      .select('id')
      .eq('editor_id', user.id)
      .limit(1);

    if (ownerError || editorError) {
      message('statusMessage', 'No se pudieron comprobar los permisos.', true);
      return;
    }

    isAdmin = !!(ownerRows && ownerRows.length);
    isEditor = !!(editorRows && editorRows.length);

    if (!isAdmin && !isEditor) {
      message('statusMessage', 'Esta cuenta no tiene acceso al diario.', true);
      return;
    }

    $('addBtn').classList.toggle('hidden', !isAdmin);

    const heading = appView.querySelector('.intro h2');
    if (heading) {
      heading.textContent = isAdmin
        ? 'Tu registro de cazador'
        : 'Registro de combate';
    }

    const subtitle = appView.querySelector('.intro .muted');
    if (subtitle) {
      subtitle.textContent = isAdmin
        ? 'Administra criaturas, jefes y rangos de rivales.'
        : 'Registra tus combates y consulta tu clasificación.';
    }

    await loadEntries();
  }

  async function setup() {
    if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
      message('loginMessage', 'Falta configurar Supabase.', true);
      return;
    }

    db = window.supabase.createClient(
      cfg.SUPABASE_URL,
      cfg.SUPABASE_ANON_KEY
    );

    const { data, error } = await db.auth.getSession();

    if (error) {
      message('loginMessage', error.message, true);
      return;
    }

    if (data.session) {
      await enterApp(data.session.user);
    } else {
      showLogin();
    }

    db.auth.onAuthStateChange((_event, session) => {
      if (session) {
        enterApp(session.user);
      } else {
        showLogin();
      }
    });
  }

  $('loginForm').addEventListener('submit', async event => {
    event.preventDefault();

    if (!db) {
      message('loginMessage', 'La conexión todavía no está preparada.', true);
      return;
    }

    message('loginMessage', 'Entrando…');

    const { error } = await db.auth.signInWithPassword({
      email: $('email').value.trim(),
      password: $('password').value
    });

    if (error) {
      message('loginMessage', error.message, true);
    }
  });

  $('logoutBtn').addEventListener('click', async () => {
    await db.auth.signOut();
  });

  async function loadEntries() {
    message('statusMessage', 'Cargando el diario…');

    const { data, error } = await db
      .from('hunter_entries')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      message('statusMessage', 'Error: ' + error.message, true);
      return;
    }

    entries = data || [];

    await renderEntries();
    await loadPlayerRank();

    message('statusMessage', '');
  }

  async function getImageUrl(path) {
    if (!path) return '';

    const { data, error } = await db.storage
      .from(bucket)
      .createSignedUrl(path, 3600);

    return error ? '' : data.signedUrl;
  }

  async function renderEntries() {
    const query = $('searchInput').value.toLowerCase();
    const filter = $('filterSelect').value;
    const rankFilter = $('rankFilter').value;

    const filtered = entries.filter(item => {
      const matchesText =
        (item.name + ' ' + (item.description || ''))
          .toLowerCase()
          .includes(query);

      const matchesType =
        filter === 'all' ||
        (filter === 'boss' ? item.is_boss : !item.is_boss);

      const matchesRank =
        rankFilter === 'all' ||
        (item.opponent_rank || 'LT5') === rankFilter;

      return matchesText && matchesType && matchesRank;
    });

    const grid = $('entriesGrid');
    grid.innerHTML = '';

    for (const item of filtered) {
      const imageUrl = await getImageUrl(item.image_url);

      const card = document.createElement('article');
      card.className = 'entry-card';

      const image = document.createElement('div');
      image.className = 'entry-image';

      if (imageUrl) {
        const img = document.createElement('img');
        img.src = imageUrl;
        img.alt = item.name;
        image.append(img);
      } else {
        image.textContent = '✧';
      }

      const content = document.createElement('div');
      content.className = 'entry-content';

      const tag = document.createElement('div');
      tag.className = 'tag';
      tag.textContent = item.is_boss ? 'JEFE' : 'CRIATURA';

      const title = document.createElement('h3');
      title.textContent = item.name;

      const description = document.createElement('p');
      description.className = 'description';
      description.textContent = item.description || 'Sin descripción.';

      const opponentRank = document.createElement('p');
      opponentRank.className = 'record';
      opponentRank.textContent =
        'Rango del rival: ' + (item.opponent_rank || 'LT5');

      const record = document.createElement('p');
      record.className = 'record';
      record.textContent =
        `Victorias: ${item.wins} · Derrotas: ${item.losses} · Partidas: ${item.matches ?? 0}`;

      const actions = document.createElement('div');
      actions.className = 'card-actions';

      if (isAdmin) {
        const edit = document.createElement('button');
        edit.className = 'ghost';
        edit.textContent = 'Editar';
        edit.addEventListener('click', () => openEdit(item));

        const remove = document.createElement('button');
        remove.className = 'ghost';
        remove.textContent = 'Eliminar';
        remove.addEventListener('click', () => deleteEntry(item));

        actions.append(edit, remove);

      } else if (isEditor) {
        const win = document.createElement('button');
        win.className = 'primary';
        win.textContent = '✓ Victoria';
        win.addEventListener('click', () => registerMatch(item, 'win', win));

        const loss = document.createElement('button');
        loss.className = 'ghost';
        loss.textContent = '✕ Derrota';
        loss.addEventListener('click', () => registerMatch(item, 'loss', loss));

        actions.append(win, loss);
      }

      content.append(
        tag,
        title,
        description,
        opponentRank,
        record,
        actions
      );

      card.append(image, content);
      grid.append(card);
    }

    $('emptyState').classList.toggle('hidden', filtered.length > 0);

    $('totalStat').textContent = entries.length;

    $('winsStat').textContent =
      entries.reduce((sum, item) => sum + Number(item.wins || 0), 0);

    $('lossesStat').textContent =
      entries.reduce((sum, item) => sum + Number(item.losses || 0), 0);

    $('matchesStat').textContent =
      entries.reduce((sum, item) => sum + Number(item.matches || 0), 0);
  }

  async function registerMatch(item, result, button) {
    if (!isEditor || isAdmin) return;

    const resultName = result === 'win' ? 'VICTORIA' : 'DERROTA';

    if (!confirm(
      `¿Confirmas una ${resultName} contra ${item.name} (${item.opponent_rank || 'LT5'})?`
    )) {
      return;
    }

    const buttons = button.parentElement.querySelectorAll('button');
    buttons.forEach(btn => btn.disabled = true);

    message('statusMessage', 'Registrando combate y calculando ELO…');

    try {
      const { error } = await db.rpc('record_hunter_match', {
        p_entry_id: item.id,
        p_result: result
      });

      if (error) throw error;

      await loadEntries();

      message(
        'statusMessage',
        `¡${resultName} registrada! Tu ELO y tu rango se han actualizado.`
      );

    } catch (error) {
      message('statusMessage', 'No se pudo registrar el combate: ' + error.message, true);
      buttons.forEach(btn => btn.disabled = false);
    }
  }

  function resetForm() {
    $('entryForm').reset();

    $('entryRank').value = 'LT5';
    $('entryWins').value = 0;
    $('entryLosses').value = 0;
    $('entryMatches').value = 0;
    $('entryImage').value = '';

    editingId = null;

    $('dialogTitle').textContent = 'Añadir entrada';
    $('saveBtn').textContent = 'Guardar entrada';

    message('formMessage', '');
  }

  function openEdit(item) {
    if (!isAdmin) return;

    resetForm();

    editingId = item.id;

    $('dialogTitle').textContent = 'Editar entrada';
    $('saveBtn').textContent = 'Guardar cambios';

    $('entryName').value = item.name;
    $('entryDescription').value = item.description || '';
    $('entryRank').value = item.opponent_rank || 'LT5';
    $('entryBoss').checked = item.is_boss;
    $('entryWins').value = item.wins;
    $('entryLosses').value = item.losses;
    $('entryMatches').value = item.matches ?? 0;

    dialog.showModal();
  }

  $('addBtn').addEventListener('click', () => {
    if (!isAdmin) return;

    resetForm();
    dialog.showModal();
  });

  $('closeDialog').addEventListener('click', () => dialog.close());
  $('cancelBtn').addEventListener('click', () => dialog.close());

  $('searchInput').addEventListener('input', renderEntries);
  $('filterSelect').addEventListener('change', renderEntries);
  $('rankFilter').addEventListener('change', renderEntries);

  $('entryForm').addEventListener('submit', async event => {
    event.preventDefault();

    if (!isAdmin) return;

    $('saveBtn').disabled = true;
    message('formMessage', 'Guardando…');

    try {
      const payload = {
        name: $('entryName').value.trim(),
        description: $('entryDescription').value.trim(),
        opponent_rank: $('entryRank').value,
        is_boss: $('entryBoss').checked,
        wins: Number($('entryWins').value),
        losses: Number($('entryLosses').value),
        matches: Number($('entryMatches').value)
      };

      const validStats = [
        payload.wins,
        payload.losses,
        payload.matches
      ].every(value =>
        Number.isSafeInteger(value) && value >= 0
      );

      if (!payload.name) {
        throw new Error('Escribe un nombre.');
      }

      if (!validStats) {
        throw new Error('Comprueba los números introducidos.');
      }

      if (!RANKS.includes(payload.opponent_rank)) {
        throw new Error('Selecciona un rango válido.');
      }

      const file = $('entryImage').files[0];

      if (file) {
        if (!file.type.startsWith('image/')) {
          throw new Error('El archivo debe ser una imagen.');
        }

        if (file.size > 5 * 1024 * 1024) {
          throw new Error('La imagen no puede superar 5 MB.');
        }

        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `${user.id}/${crypto.randomUUID()}-${safeName}`;

        const { error: uploadError } = await db.storage
          .from(bucket)
          .upload(path, file, {
            contentType: file.type,
            upsert: false
          });

        if (uploadError) throw uploadError;

        payload.image_url = path;
      }

      const result = editingId
        ? await db.from('hunter_entries').update(payload).eq('id', editingId)
        : await db.from('hunter_entries').insert(payload);

      if (result.error) throw result.error;

      dialog.close();
      resetForm();

      await loadEntries();

    } catch (error) {
      message('formMessage', error.message, true);
    } finally {
      $('saveBtn').disabled = false;
    }
  });

  async function deleteEntry(item) {
    if (!isAdmin) return;

    if (!confirm(`¿Eliminar "${item.name}" del diario?`)) return;

    const { error } = await db
      .from('hunter_entries')
      .delete()
      .eq('id', item.id);

    if (error) {
      message('statusMessage', error.message, true);
      return;
    }

    if (item.image_url) {
      await db.storage.from(bucket).remove([item.image_url]);
    }

    await loadEntries();
  }

  setup();
})();
