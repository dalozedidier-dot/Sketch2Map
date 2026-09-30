'use strict';
(() => {
  const button = document.getElementById('installBtn');
  let promptEvent = null;
  const installed = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const update = () => { button.hidden = installed(); };
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    promptEvent = event;
    update();
  });
  window.addEventListener('appinstalled', () => { promptEvent = null; update(); });
  button.addEventListener('click', async () => {
    if (promptEvent) {
      const event = promptEvent;
      promptEvent = null;
      await event.prompt();
      await event.userChoice;
      update();
      return;
    }
    const message = /iPad|iPhone|iPod/.test(navigator.userAgent)
      ? 'Dans Safari, ouvrez Partager puis « Sur l’écran d’accueil ».'
      : 'Dans le menu du navigateur, choisissez « Installer l’application » ou « Ajouter à l’écran d’accueil ».';
    if (window.Studio?.toast) Studio.toast(message);
    else alert(message);
  });
  update();
})();
