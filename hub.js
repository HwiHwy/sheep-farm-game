const gameRoot = document.querySelector('#gameRoot');
const gameMenu = document.querySelector('#gameMenu');
const topbar = document.querySelector('#hubTopbar');
const activeGameName = document.querySelector('#activeGameName');
const openGameMenuButton = document.querySelector('#openGameMenu');
const continueRow = document.querySelector('#continueRow');
const continueGameButton = document.querySelector('#continueGame');

const games = {
  farm: {
    title: 'Nông Trại Cừu',
    src: './farm/'
  },
  claw: {
    title: 'Máy Gắp Thú',
    src: './claw/'
  }
};

const frames = new Map();
let activeGame = null;

function showMenu() {
  continueRow.hidden = !activeGame;
  continueGameButton.textContent = activeGame
    ? `TIẾP TỤC ${games[activeGame].title.toLocaleUpperCase('vi-VN')}`
    : 'TIẾP TỤC TRÒ CHƠI';
  gameMenu.classList.add('is-open');
  gameMenu.setAttribute('aria-hidden', 'false');
}

function hideMenu() {
  gameMenu.classList.remove('is-open');
  gameMenu.setAttribute('aria-hidden', 'true');
}

function getOrCreateFrame(gameId) {
  if (frames.has(gameId)) return frames.get(gameId);
  const frame = document.createElement('iframe');
  frame.className = 'game-frame';
  frame.title = games[gameId].title;
  frame.allow = 'autoplay; fullscreen; gamepad';
  frame.allowFullscreen = true;
  frame.src = games[gameId].src;
  frame.hidden = true;
  gameRoot.appendChild(frame);
  frames.set(gameId, frame);
  return frame;
}

function selectGame(gameId) {
  if (!games[gameId]) return;
  const nextFrame = getOrCreateFrame(gameId);

  for (const [id, frame] of frames.entries()) {
    frame.hidden = id !== gameId;
    if (frame.contentWindow) {
      frame.contentWindow.postMessage({
        type: 'mini-game-visibility',
        visible: id === gameId
      }, '*');
    }
  }

  activeGame = gameId;
  activeGameName.textContent = games[gameId].title;
  topbar.hidden = false;
  nextFrame.hidden = false;
  hideMenu();
}

document.querySelectorAll('[data-game]').forEach((button) => {
  button.addEventListener('click', () => selectGame(button.dataset.game));
});

openGameMenuButton.addEventListener('click', showMenu);
continueGameButton.addEventListener('click', hideMenu);

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && activeGame && gameMenu.classList.contains('is-open')) {
    hideMenu();
  }
});

// The game chooser is the landing screen. No game starts until one is selected.
showMenu();
