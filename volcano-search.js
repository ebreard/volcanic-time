const aliases = new Map([['341040', ['Volcan de Fuego', 'Fuego de Colima']]]);
const normalize = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export function volcanoChoices(events) {
  const choices = new Map();
  for (const event of events) {
    const id = String(event.v);
    if (choices.has(id)) continue;
    const alternateNames = aliases.get(id) || [];
    choices.set(id, {
      id, name: event.name, country: event.country || 'Country unspecified',
      aliases: alternateNames,
      search: normalize([event.name, event.country, id, ...alternateNames].join(' ')),
    });
  }
  return [...choices.values()].sort((a, b) => a.name.localeCompare(b.name) || a.country.localeCompare(b.country) || a.id.localeCompare(b.id));
}

export function matchingVolcanoes(choices, query) {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  return words.length ? choices.filter(choice => words.every(word => choice.search.includes(word))) : [];
}

export function installVolcanoSearch(input, list, events, onChange) {
  const choices = volcanoChoices(events);
  const container = input.closest('.search-picker');
  let selectedId = null;
  let matches = [];
  let active = -1;

  function close() {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
  }

  function render() {
    matches = selectedId === null ? matchingVolcanoes(choices, input.value) : [];
    list.replaceChildren();
    active = -1;
    input.removeAttribute('aria-activedescendant');
    const panelBottom = container.closest('.browser-panel').getBoundingClientRect().bottom;
    const fieldBottom = container.getBoundingClientRect().bottom;
    list.style.setProperty('--search-room', `${Math.max(60, panelBottom - fieldBottom - 8)}px`);
    for (const [index, choice] of matches.entries()) {
      const option = document.createElement('button');
      option.type = 'button';
      option.tabIndex = -1;
      option.id = `volcano-option-${choice.id}`;
      option.dataset.index = String(index);
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', 'false');
      const name = document.createElement('strong');
      name.textContent = choice.name;
      const detail = document.createElement('span');
      detail.textContent = `${choice.country} | GVP ${choice.id}`;
      option.append(name, detail);
      if (choice.aliases.length) {
        const alternate = document.createElement('small');
        alternate.textContent = `Also ${choice.aliases[0]}`;
        option.append(alternate);
      }
      list.append(option);
    }
    list.hidden = !matches.length;
    input.setAttribute('aria-expanded', String(matches.length > 0));
  }

  function choose(index) {
    const choice = matches[index];
    if (!choice) return;
    selectedId = choice.id;
    input.value = `${choice.name} - ${choice.country}`;
    close();
    input.focus();
    onChange();
  }

  input.addEventListener('input', () => {
    selectedId = null;
    render();
    onChange();
  });
  input.addEventListener('focus', render);
  input.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (!list.hidden) event.preventDefault();
      close();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (list.hidden) render();
      if (!matches.length) return;
      event.preventDefault();
      active = active < 0 ? (event.key === 'ArrowDown' ? 0 : matches.length - 1)
        : (active + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length;
      [...list.children].forEach((option, index) => option.setAttribute('aria-selected', String(index === active)));
      input.setAttribute('aria-activedescendant', list.children[active].id);
      list.children[active].scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter' && !list.hidden && active >= 0) {
      event.preventDefault();
      choose(active);
    }
  });
  list.addEventListener('mousedown', event => {
    if (event.target.closest('[role="option"]')) event.preventDefault();
  });
  list.addEventListener('click', event => {
    const option = event.target.closest('[role="option"]');
    if (option && list.contains(option)) choose(Number(option.dataset.index));
  });
  container.addEventListener('focusout', event => {
    if (!container.contains(event.relatedTarget)) close();
  });
  document.addEventListener('pointerdown', event => {
    if (!container.contains(event.target)) close();
  });
  window.addEventListener('resize', close);
  return {
    get selectedId() { return selectedId; },
    clear() { selectedId = null; close(); },
  };
}
