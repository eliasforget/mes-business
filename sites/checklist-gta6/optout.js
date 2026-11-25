// Désactive la mesure d'audience Umami sur cet appareil (clé officielle d'Umami : umami.disabled).
const bouton = document.getElementById('optout');
const etat = document.getElementById('optout-etat');
function majEtat() {
  let coupe = false;
  try { coupe = localStorage.getItem('umami.disabled') === '1'; } catch { /* stockage indisponible */ }
  etat.textContent = coupe ? 'La mesure est désactivée sur cet appareil.' : '';
  bouton.textContent = coupe ? 'Réactiver la mesure sur cet appareil' : 'Désactiver la mesure sur cet appareil';
}
bouton.addEventListener('click', () => {
  try {
    if (localStorage.getItem('umami.disabled') === '1') localStorage.removeItem('umami.disabled');
    else localStorage.setItem('umami.disabled', '1');
  } catch {
    etat.textContent = 'Ton navigateur bloque le stockage : désactive la mesure dans ses réglages.';
    return;
  }
  majEtat();
});
majEtat();
