
(() => {
  const cfg = window.APP_CONFIG || {};
  const $ = id => document.getElementById(id);
  const loginView = $('loginView');
  const appView = $('appView');
  const dialog = $('entryDialog');
  const bucket = 'hunter-skins';

  let db;
  let user;
  let entries = [];
  let editingId = null;
  let isAdmin = false;

  function message(id, text, error = false) {
    const el = $(id);
    el.textContent = text;
    el.style.color = error ? '#e08b7d' : '';
  }

  function showLogin() {
    user = null;
    entries = [];
    loginView.classList.remove('hidden');
    appView.classList.add('hidden');
    $('logoutBtn').classList.add('hidden');
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
      message(
        'statusMessage',
        'No se pudieron comprobar los permisos.',
        true
      );
      return;
    }

    isAdmin = !!(ownerRows && ownerRows.length);

    if (!isAdmin && !(editorRows && editorRows.length)) {
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
        ? 'Administra criaturas, jefes y estadísticas.'
        : 'Consulta las criaturas y actualiza tus estadísticas.';
    }
async function loadPlayerRank() {
  const { data, error } = await db
    .from('hunter_player_ratings')
    .select('elo, rank')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    message('statusMessage', 'No se pudo cargar el rango.', true);
    return;
  }

  if (!data) {
    $('playerRank').textContent = 'HT5';
    $('playerElo').textContent = '1000';
    return;
  }

  $('playerRank').textContent = data.rank;
  $('playerElo').textContent = data.elo;
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

    const { data } = await db.auth.getSession();

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
    message('loginMessage', 'Entrando…');

    const { error } = await db.auth.signInWithPassword({
      email: $('email').value.trim(),
      password: $('password').value
    });

    if (error) {
      message('loginMessage', error.message, true);
    }
  });

  $('logoutBtn').addEventListener('click', () => {
    db.auth.signOut();
  });

  async function loadEntries(await loadPlayerRank();) {
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

    const filtered = entries.filter(item => {
      const matchesText =
        (item.name + ' ' + (item.description || ''))
          .toLowerCase().includes(query);

      const matchesType =
        filter === 'all' ||
        (filter === 'boss' ? item.is_boss : !item.is_boss);

      return matchesText && matchesType;
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
      } else {
        const update = document.createElement('button');
        update.className = 'primary';
        update.textContent = 'Actualizar estadísticas';
        update.addEventListener('click', () => updateStats(item));
        actions.append(update);
      }

      content.append(tag, title, description, record, actions);
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

  async function updateStats(item) {
    const winsInput = prompt('Victorias:', item.wins);
    if (winsInput === null) return;

    const lossesInput = prompt('Derrotas:', item.losses);
    if (lossesInput === null) return;

    const matchesInput = prompt('Partidas:', item.matches ?? 0);
    if (matchesInput === null) return;

    const wins = Number(winsInput);
    const losses = Number(lossesInput);
    const matches = Number(matchesInput);

    const valid = [wins, losses, matches].every(
      value => Number.isSafeInteger(value) && value >= 0
    );

    if (!valid) {
      alert('Introduce números enteros iguales o superiores a cero.');
      return;
    }

    message('statusMessage', 'Guardando estadísticas…');

    const { error } = await db.rpc('update_hunter_entry_stats', {
      p_entry_id: item.id,
      p_wins: wins,
      p_losses: losses,
      p_matches: matches
    });

    if (error) {
      message('statusMessage', 'Error: ' + error.message, true);
      return;
    }

    await loadEntries();
    message('statusMessage', 'Estadísticas actualizadas correctamente.');
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
        name: $('entryName').value.trim(),
        description: $('entryDescription').value.trim(),
        is_boss: $('entryBoss').checked,
        wins: Number($('entryWins').value),
        losses: Number($('entryLosses').value),
        matches: Number($('entryMatches').value)
      };

      if (!Object.values(payload).every((value, index) =>
        index < 2 || typeof value === 'boolean' ||
        (Number.isSafeInteger(value) && value >= 0)
      )) {
        throw new Error('Comprueba los números introducidos.');
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
        const path =
          `${user.id}/${crypto.randomUUID()}-${safeName}`;

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
    } else {
      if (item.image_url) {
        await db.storage.from(bucket).remove([item.image_url]);
      }
      await loadEntries();
    }
  }

  setup();
})();
