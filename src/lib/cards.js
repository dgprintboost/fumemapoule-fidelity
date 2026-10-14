// Les deux cartes de fidélité d'un même compte, portées par le même document Firestore.
// Gains : affichage seulement, rien n'est enregistré en base.
export const STAMPS_FOR_REWARD = 10

export const CARDS = {
  green: { label: 'Carte verte', field: 'stamps', reward: '3g offerts ou -20 %' },
  blue: { label: 'Carte bleue', field: 'stampsBlue', reward: '1g offert ou -10 %' },
}

export function isCardColor(value) {
  return Object.hasOwn(CARDS, value)
}

// Les cartes créées avant la carte bleue n'ont pas de stampsBlue : compteur à 0.
export function stampsOf(data, color) {
  return data[CARDS[color].field] ?? 0
}

// Contenu du QR : l'identifiant de carte seul pour la verte (format d'origine), suffixé ':blue' pour la bleue.
// L'indicateur ne donne aucun droit : il désigne seulement la carte que le client veut faire tamponner.
export function qrPayload(cardId, color) {
  return color === 'blue' ? `${cardId}:blue` : cardId
}

// Identifiant Firestore généré automatiquement : 20 caractères alphanumériques.
const QR_PATTERN = /^([A-Za-z0-9]{20})(?::(green|blue))?$/

// Renvoie { id, color }, ou null si le texte n'est pas un QR de carte.
export function parseQrPayload(text) {
  const match = QR_PATTERN.exec(text)
  return match ? { id: match[1], color: match[2] ?? 'green' } : null
}
