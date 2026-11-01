
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

  function message(id, text, error = false) {
    const el = $(id);
    el.textContent = text;
    el.style.color = error ? '#e08b7d' : '';
  }

  function showLogin() {
    user = null;
    loginView.classList.remove('hidden');
    appView.classList.add('hidden');
    $('logoutBtn').classList.add('hidden');
  }

  async function enterApp(currentUser) {
    user = currentUser;
    loginView.classList.add('hidden');
    appView.classList.remove('hidden');
    $('logoutBtn').classList.remove('hidden');
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
        `Victorias: ${item.wins} · Derrotas: ${item.losses} · Combates: ${item.wins + item.losses}`;

      const actions = document.createElement('div');
      actions.className = 'card-actions';

      const edit = document.createElement('button');
      edit.className = 'ghost';
      edit.textContent = 'Editar';
      edit.addEventListener('click', () => openEdit(item));

      const remove = document.createElement('button');
      remove.className = 'ghost';
      remove.textContent = 'Eliminar';
      remove.addEventListener('click', () => deleteEntry(item));

      actions.append(edit, remove);
      content.append(tag, title, description, record, actions);
      card.append(image, content);
      grid.append(card);
    }

    $('emptyState').classList.toggle('hidden', filtered.length > 0);

    $('totalStat').textContent = entries.length;
    $('winsStat').textContent =
      entries.reduce((sum, item) => sum + item.wins, 0);
    $('lossesStat').textContent =
      entries.reduce((sum, item) => sum + item.losses, 0);
    $('matchesStat').textContent =
      entries.reduce((sum, item) => sum + item.wins + item.losses, 0);
  }

  function resetForm() {
    $('entryForm').reset();
    $('entryWins').value = 0;
    $('entryLosses').value = 0;
    $('entryImage').value = '';
    editingId = null;
    $('dialogTitle').textContent = 'Añadir entrada';
    $('saveBtn').textContent = 'Guardar entrada';
    message('formMessage', '');
  }

  function openEdit(item) {
    resetForm();
    editingId = item.id;
    $('dialogTitle').textContent = 'Editar entrada';
    $('saveBtn').textContent = 'Guardar cambios';
    $('entryName').value = item.name;
    $('entryDescription').value = item.description || '';
    $('entryBoss').checked = item.is_boss;
    $('entryWins').value = item.wins;
    $('entryLosses').value = item.losses;
    dialog.showModal();
  }

  $('addBtn').addEventListener('click', () => {
    resetForm();
    dialog.showModal();
  });

  $('closeDialog').addEventListener('click', () => dialog.close());
  $('cancelBtn').addEventListener('click', () => dialog.close());
  $('searchInput').addEventListener('input', renderEntries);
  $('filterSelect').addEventListener('change', renderEntries);

  $('entryForm').addEventListener('submit', async event => {
    event.preventDefault();
    $('saveBtn').disabled = true;
    message('formMessage', 'Guardando…');

    try {
      const payload = {
        name: $('entryName').value.trim(),
        description: $('entryDescription').value.trim(),
        is_boss: $('entryBoss').checked,
        wins: Number($('entryWins').value),
        losses: Number($('entryLosses').value)
      };

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
    if (!confirm(`¿Eliminar "${item.name}" del diario?`)) return;

    if (item.image_url) {
      await db.storage.from(bucket).remove([item.image_url]);
    }

    const { error } = await db
      .from('hunter_entries')
      .delete()
      .eq('id', item.id);

    if (error) {
      message('statusMessage', error.message, true);
    } else {
      await loadEntries();
    }
  }

  setup();
})();
