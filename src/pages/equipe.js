import '../style.css'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { collection, doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore'
import QrScanner from 'qr-scanner'
import { CARDS, STAMPS_FOR_REWARD, parseQrPayload, stampsOf } from '../lib/cards.js'
import { STAFF_APP_NAME, initFirebase } from '../lib/firebase.js'

// Instance Firebase propre à l'espace équipe : sa connexion ne touche jamais l'identité anonyme du client.
const { auth, db } = initFirebase(STAFF_APP_NAME)

const COOLDOWN_MS = 60 * 60 * 1000
const SLOW_NETWORK_MS = 10_000

const loginForm = document.getElementById('loginForm')
const emailInput = document.getElementById('email')
const passwordInput = document.getElementById('password')
const togglePassword = document.getElementById('togglePassword')
const loginError = document.getElementById('loginError')
const loginBtn = document.getElementById('loginBtn')
const staffPanel = document.getElementById('staffPanel')
const video = document.getElementById('scanVideo')
const scanBtn = document.getElementById('scanBtn')
const scanResult = document.getElementById('scanResult')
const clientName = document.getElementById('clientName')
const clientStamps = document.getElementById('clientStamps')
const cardBadge = document.getElementById('cardBadge')
const cardReward = document.getElementById('cardReward')
const stampBtn = document.getElementById('stampBtn')
const rewardBtn = document.getElementById('rewardBtn')
const staffMessage = document.getElementById('staffMessage')
const logoutBtn = document.getElementById('logoutBtn')

let scanner = null
let current = null // { id, color, data } : carte scannée et couleur choisie par le client (QR)

function setVisible(element, visible) {
  element.classList.toggle('hidden', !visible)
  element.classList.toggle('flex', visible)
}

function say(text, isError = false) {
  staffMessage.textContent = text
  staffMessage.classList.toggle('text-fmp-rust', isError)
  staffMessage.classList.toggle('text-fmp-sage', !isError)
}

// --- Connexion -------------------------------------------------------------

// Renvoie true / false, ou lève une erreur si la vérification est impossible (réseau, App Check).
async function isStaff(user) {
  if (!user || user.isAnonymous) return false
  return (await getDoc(doc(db, 'staff', user.uid))).exists()
}

function showStaffPanel(visible) {
  setVisible(loginForm, !visible)
  setVisible(staffPanel, visible)
  if (!visible) resetScan()
}

onAuthStateChanged(auth, async (user) => {
  let allowed
  try {
    allowed = await isStaff(user)
  } catch {
    // Erreur technique : ne pas déconnecter un équipier légitime.
    showStaffPanel(false)
    loginError.textContent = 'Vérification du compte impossible. Vérifie la connexion puis recharge la page.'
    return
  }
  if (user && !user.isAnonymous && !allowed) {
    // Le panneau reste masqué même si la déconnexion échoue : les règles refusent tout à ce compte.
    await signOut(auth).catch(() => {})
    loginError.textContent = "Ce compte n'a pas accès à l'espace équipe."
  }
  showStaffPanel(allowed)
})

function setPasswordVisible(visible) {
  passwordInput.type = visible ? 'text' : 'password'
  togglePassword.textContent = visible ? 'Masquer' : 'Afficher'
  togglePassword.setAttribute('aria-pressed', String(visible))
}

togglePassword.addEventListener('click', () => setPasswordVisible(passwordInput.type === 'password'))
// Le navigateur peut restaurer la page telle quelle (bouton Précédent, rechargement) : jamais en clair.
window.addEventListener('pagehide', () => setPasswordVisible(false))

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  // Le mot de passe ne reste jamais affiché après l'envoi du formulaire.
  setPasswordVisible(false)
  loginError.textContent = ''
  loginBtn.disabled = true
  try {
    await signInWithEmailAndPassword(auth, emailInput.value.trim(), passwordInput.value)
    passwordInput.value = ''
  } catch {
    loginError.textContent = 'Email ou mot de passe incorrect.'
  } finally {
    loginBtn.disabled = false
  }
})

logoutBtn.addEventListener('click', () =>
  signOut(auth).catch(() => say('Déconnexion impossible. Vérifie la connexion puis réessaie.', true)),
)

// --- Scan ------------------------------------------------------------------

// Chaque chargement de carte reçoit un numéro : seul le plus récent a le droit de s'afficher.
// Sinon une lecture lente (scan précédent, rafraîchissement) pourrait réafficher une autre carte.
let loadSeq = 0

function resetScan() {
  scanner?.stop()
  loadSeq++
  current = null
  setVisible(scanResult, false)
}

scanBtn.addEventListener('click', async () => {
  resetScan()
  say('')
  try {
    scanner ??= new QrScanner(video, (result) => onScan(result.data), {
      returnDetailedScanResult: true,
      preferredCamera: 'environment',
    })
    await scanner.start()
  } catch {
    say("Caméra indisponible. Autorise l'accès à la caméra puis réessaie.", true)
  }
})

async function onScan(data) {
  scanner.stop()
  const scanned = parseQrPayload(data)
  if (!scanned) {
    resetScan()
    say("Ce QR code n'est pas une carte de fidélité.", true)
    return
  }
  try {
    await loadCard(scanned.id, scanned.color)
  } catch {
    say('Impossible de lire cette carte. Réessaie.', true)
  }
}

// Affiche la carte ; renvoie true si c'est bien elle qui est affichée à la fin de la lecture.
async function loadCard(id, color) {
  const seq = ++loadSeq
  let snapshot
  try {
    snapshot = await getDoc(doc(db, 'cards', id))
  } catch (error) {
    // L'échec d'une lecture dépassée (autre carte scannée depuis) ne doit rien afficher.
    if (seq !== loadSeq) return false
    throw error
  }
  if (seq !== loadSeq) return false
  if (!snapshot.exists()) {
    current = null
    setVisible(scanResult, false)
    say('Carte introuvable.', true)
    return false
  }
  current = { id, color, data: snapshot.data() }
  renderCard()
  return true
}

function renderCard() {
  const { color, data } = current
  const { lastStamp, firstName } = data
  const stamps = stampsOf(data, color)
  scanResult.classList.toggle('card-blue', color === 'blue')
  cardBadge.textContent = CARDS[color].label
  cardReward.textContent = CARDS[color].reward
  clientName.textContent = firstName
  clientStamps.textContent = String(stamps)
  setVisible(scanResult, true)

  const full = stamps >= STAMPS_FOR_REWARD
  // Indication seulement : le délai d'une heure est imposé par les règles Firestore.
  const tooSoon = lastStamp && Date.now() - lastStamp.toMillis() < COOLDOWN_MS
  stampBtn.classList.toggle('hidden', full)
  stampBtn.disabled = Boolean(tooSoon)
  rewardBtn.classList.toggle('hidden', !full)
  rewardBtn.disabled = false

  if (full) say(`${CARDS[color].label} pleine : remets « ${CARDS[color].reward} » puis valide.`)
  else if (tooSoon) say('Déjà tamponnée il y a moins d’une heure (cartes verte et bleue confondues).', true)
}

// --- Tampon et cadeau ------------------------------------------------------

// Modifie la carte et journalise l'événement (avec la carte concernée) dans le même batch (exigé par les règles).
async function commitCardChange(cardId, color, type, changes) {
  const cardRef = doc(db, 'cards', cardId)
  const eventRef = doc(collection(cardRef, 'history'))
  const batch = writeBatch(db)
  batch.set(eventRef, { type, card: color, at: serverTimestamp(), staffUid: auth.currentUser.uid })
  batch.update(cardRef, { ...changes, lastEventId: eventRef.id })
  await batch.commit()
}

// La carte visée est figée avant le premier await, et le scan / la déconnexion restent bloqués
// jusqu'à la fin du rafraîchissement : le résultat ne peut pas être attribué à une autre carte.
async function runAction(button, buildChanges, type, successText) {
  if (!current) return
  const { id, color, data } = current
  for (const control of [button, scanBtn, logoutBtn]) control.disabled = true
  say('Envoi en cours…')
  // Hors ligne, l'envoi reste en attente au lieu d'échouer : prévenir plutôt que laisser l'écran figé.
  const slowTimer = setTimeout(() => say('Connexion lente… ne recharge pas la page.', true), SLOW_NETWORK_MS)

  let failure = null
  try {
    await commitCardChange(id, color, type, buildChanges(data, color))
  } catch (error) {
    failure = error
  }
  clearTimeout(slowTimer)

  const refreshed = await refresh(id, color)
  scanBtn.disabled = false
  logoutBtn.disabled = false
  if (!refreshed) {
    // Carte non rechargée : boutons dans un état inconnu, on repart d'un nouveau scan.
    resetScan()
  }

  if (!failure) {
    say(refreshed ? successText(current) : `${successText(null)} Rescanne la carte pour la revoir.`)
    return
  }
  const reason =
    failure.code === 'permission-denied'
      ? 'Action refusée : la carte a déjà été mise à jour. Vérifie le nombre de tampons.'
      : 'Erreur réseau : rien n’a été enregistré.'
  say(refreshed ? reason : `${reason} Rescanne la carte.`, true)
}

// Recharge la carte affichée ; renvoie false si la lecture échoue.
async function refresh(id, color) {
  if (current?.id !== id || current.color !== color) return false
  try {
    return await loadCard(id, color)
  } catch {
    return false
  }
}

stampBtn.addEventListener('click', () =>
  runAction(
    stampBtn,
    // Un seul compteur change : celui de la carte choisie par le client.
    (data, color) => ({ [CARDS[color].field]: stampsOf(data, color) + 1, lastStamp: serverTimestamp() }),
    'stamp',
    (card) =>
      card
        ? `Tampon ajouté ✔ ${CARDS[card.color].label} : ${stampsOf(card.data, card.color)}/10`
        : 'Tampon ajouté ✔',
  ),
)

rewardBtn.addEventListener('click', () =>
  runAction(
    rewardBtn,
    (_, color) => ({ [CARDS[color].field]: 0 }),
    'reward',
    (card) => (card ? `Cadeau remis 🎁 ${CARDS[card.color].label} repart à 0.` : 'Cadeau remis 🎁'),
  ),
)
