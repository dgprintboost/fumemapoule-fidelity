import '../style.css'
import { doc, getDoc, onSnapshot } from 'firebase/firestore'
import QRCode from 'qrcode'
import { CARDS, isCardColor, qrPayload, stampsOf } from '../lib/cards.js'
import {
  db,
  clearStoredCardId,
  ensureClientUser,
  getLastCardColor,
  getStoredCardId,
  storeLastCardColor,
} from '../lib/client.js'
import { isIos, isStandalone, registerServiceWorker } from '../lib/pwa.js'
import { formatRecoveryCode } from '../lib/recovery-code.js'

const greetingEl = document.getElementById('greeting')
const stampCountEl = document.getElementById('stampCount')
const stampCardLabel = document.getElementById('stampCardLabel')
const stampEls = [...document.querySelectorAll('#stamps .stamp')]
const rewardBanner = document.getElementById('rewardBanner')
const rewardBannerText = document.getElementById('rewardBannerText')
const rewardText = document.getElementById('rewardText')
const cardPanel = document.getElementById('cardPanel')
const tabs = [...document.querySelectorAll('[role="tab"][data-card]')]
const qrCanvas = document.getElementById('cardQr')
const recoveryCodeEl = document.getElementById('recoveryCode')
const errorEl = document.getElementById('cardError')
const lostCardActions = document.getElementById('lostCardActions')
const newCardBtn = document.getElementById('newCardBtn')
const installCard = document.getElementById('installCard')
const installIos = document.getElementById('installIos')
const installBtn = document.getElementById('installBtn')

registerServiceWorker()
setupInstallInvite()

const cardId = getStoredCardId()
// Dernière carte consultée ; au premier lancement (ou valeur inconnue), la verte.
let color = isCardColor(getLastCardColor()) ? getLastCardColor() : 'green'
let cardData = null // dernier état de la carte reçu de Firestore
let qrReady = false // le QR n'est dessiné qu'une fois la session client ouverte
let qrError = false // dernier dessin du QR en échec : le message reste affiché tant qu'il n'est pas redessiné
const QR_ERROR_TEXT = 'Impossible d’afficher le QR code. Recharge la page.'

if (!cardId) {
  location.replace('./index.html')
} else {
  setupTabs()
  selectCard(color)
  showCard(cardId)
}

function render() {
  const { label, reward } = CARDS[color]
  cardPanel.classList.toggle('card-blue', color === 'blue')
  rewardText.textContent = reward
  rewardBannerText.textContent = reward
  stampCardLabel.textContent = `${label} : `
  qrCanvas.setAttribute('aria-label', `QR code de ma ${label.toLowerCase()}`)
  if (!cardData) return
  const stamps = stampsOf(cardData, color)
  greetingEl.textContent = `Carte de ${cardData.firstName}`
  stampCountEl.textContent = String(stamps)
  stampEls.forEach((el, index) => el.classList.toggle('stamp-on', index < stamps))
  rewardBanner.classList.toggle('hidden', stamps < 10)
}

// Le QR désigne la carte sélectionnée : l'équipe tamponnera celle-ci.
// QRCode.toCanvas dessine de façon synchrone : deux changements d'onglet rapides ne peuvent pas se croiser.
async function drawQr() {
  if (!qrReady) return
  try {
    await QRCode.toCanvas(qrCanvas, qrPayload(cardId, color), { width: 200, margin: 1 })
    if (qrError && errorEl.textContent === QR_ERROR_TEXT) showError('')
    qrError = false
  } catch {
    // Jamais l'ancien QR sous un autre onglet : l'équipe tamponnerait la mauvaise carte.
    qrCanvas.getContext('2d')?.clearRect(0, 0, qrCanvas.width, qrCanvas.height)
    qrError = true
    showError(QR_ERROR_TEXT)
  }
}

function selectCard(next) {
  color = next
  storeLastCardColor(color)
  for (const tab of tabs) {
    const selected = tab.dataset.card === color
    tab.setAttribute('aria-selected', String(selected))
    tab.tabIndex = selected ? 0 : -1
    if (selected) cardPanel.setAttribute('aria-labelledby', tab.id)
  }
  render()
  drawQr()
}

// Onglets accessibles : clic, ou flèches gauche / droite quand un onglet a le focus.
function setupTabs() {
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectCard(tab.dataset.card))
    tab.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      const next = tabs[(index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]
      next.focus()
      selectCard(next.dataset.card)
    })
  })
}

function showError(text, offerRecovery = false) {
  errorEl.textContent = text
  lostCardActions.classList.toggle('hidden', !offerRecovery)
  lostCardActions.classList.toggle('flex', offerRecovery)
}

// Sortie de secours quand la carte n'est plus accessible et que le code est perdu :
// sans ça, index.html renverrait sans fin vers cette carte illisible.
newCardBtn.addEventListener('click', () => {
  if (!confirm('Créer une nouvelle carte ? Tu ne pourras plus retrouver l’ancienne sans son code de secours.')) return
  clearStoredCardId()
  location.assign('./index.html')
})

async function showCard(id) {
  try {
    await ensureClientUser()
  } catch {
    showError('Impossible de charger ta carte. Vérifie ta connexion puis recharge la page.')
    return
  }
  // Le QR ne contient que l'identifiant de la carte et sa couleur : c'est l'équipe qui tamponne.
  qrReady = true
  await drawQr()

  onSnapshot(
    doc(db, 'cards', id),
    (snapshot) => {
      // Cas défensif : pour un client, une carte supprimée arrive en pratique comme un refus d'accès
      // (la règle get lit resource.data), donc par la branche d'erreur ci-dessous.
      if (!snapshot.exists()) {
        // Hors ligne, Firestore renvoie d'abord son cache : « absente du cache » ne veut pas dire supprimée.
        // Aucune action destructive proposée tant que le serveur n'a pas répondu.
        if (snapshot.metadata.fromCache) {
          showError('Connexion impossible pour le moment. Ta carte s’affichera dès que le réseau revient.')
          return
        }
        showError("Cette carte n'existe plus. Utilise ton code de secours ou crée une nouvelle carte.", true)
        return
      }
      // Une mise à jour de la carte n'efface pas l'erreur du QR, qu'elle n'a pas réglée.
      showError(qrError ? QR_ERROR_TEXT : '')
      cardData = snapshot.data()
      render()
    },
    (error) => {
      // permission-denied est ambigu (carte reprise ailleurs, mais aussi App Check ou session passagère) :
      // on garde l'identifiant de la carte, qui ne donne aucun droit, et on propose la récupération.
      showError(
        error.code === 'permission-denied'
          ? "Ta carte n'est pas accessible ici : elle a peut-être été reprise ailleurs (app installée ou autre téléphone). Recharge la page ; si ça persiste, utilise ton code de secours."
          : 'Connexion perdue. Recharge la page pour voir ta carte à jour.',
        error.code === 'permission-denied',
      )
    },
  )

  try {
    const recovery = await getDoc(doc(db, 'cards', id, 'private', 'recovery'))
    if (recovery.exists()) recoveryCodeEl.textContent = formatRecoveryCode(recovery.data().code)
  } catch {
    recoveryCodeEl.textContent = 'Indisponible pour le moment, recharge la page.'
  }
}

// Android : bouton d'installation natif. iPhone : instructions (Safari n'a pas de bouton programmable).
function setupInstallInvite() {
  if (isStandalone()) return
  if (isIos()) {
    installIos.classList.remove('hidden')
    installCard.classList.replace('hidden', 'flex')
    return
  }
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    installCard.classList.replace('hidden', 'flex')
    installBtn.classList.remove('hidden')
    installBtn.addEventListener(
      'click',
      async () => {
        // L'invite native ne sert qu'une fois : l'encart disparaît quel que soit le choix
        // (Chrome renverra beforeinstallprompt plus tard s'il juge l'installation de nouveau possible).
        installCard.classList.replace('flex', 'hidden')
        installBtn.classList.add('hidden')
        try {
          await event.prompt()
        } catch {
          // Invite refusée par le navigateur : rien à faire, l'encart reviendra au prochain événement.
        }
      },
      { once: true },
    )
  })
}
