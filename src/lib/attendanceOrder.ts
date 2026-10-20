// The order the team attendance cards are listed in, by email. Anyone not on the list is placed
// after it, A–Z by name, so a new contributor shows up at the bottom until they're added here.
export const ATTENDANCE_ORDER = [
  'shmargallo.26@gmail.com',
  'lawrenze3206@gmail.com',
  'demiticusblack19@gmail.com',
  'jedpamisamargallo@gmail.com',
  'andyviudor@gmail.com',
  'rebucalmerylefe@gmail.com',
  'buenaventurajess42@gmail.com',
  'igcalinosangie02@gmail.com',
  'dionesiojose@gmail.com',
  'gomez.zsophiaarabelle@gmail.com',
  'kamirelax187@gmail.com',
  'callanojake1@gmail.com',
  'steaaye@gmail.com',
  'johnlouietan283@gmail.com',
  'izraeljanz@gmail.com',
  'margallo.jc0804@gmail.com',
  'josephborlado12@gmail.com',
  'charissebiancams@gmail.com',
  'ada.jyrald723@gmail.com',
  'sheanlouisemargallo@gmail.com',
  'hannamaynavarro7@gmail.com',
  'buctuangerald4@gmail.com',
  'jifferlynadajar@gmail.com',
  'jcvargas1993@gmail.com',
  'michaelrosento20@gmail.com',
  'jsunga080@gmail.com',
  'aki.park800@gmail.com',
  'crlkvn@gmail.com',
  'maryannelachicava@gmail.com',
  'jeopamisa@gmail.com',
  'alaanmariel0@gmail.com',
  'vonmark608@gmail.com',
  'annelachicava@gmail.com',
  'augustdseranoel@gmail.com',
  'marklastimoso111@gmail.com',
  'rz.campaner21@gmail.com',
  'macasaylester@gmail.com',
]

const rankByEmail = new Map(ATTENDANCE_ORDER.map((email, i) => [email, i]))

function rank(email: string) {
  return rankByEmail.get(email.trim().toLowerCase()) ?? ATTENDANCE_ORDER.length
}

/** Sorts people into the attendance list's order; anyone off the list goes last, by name. */
export function compareAttendanceOrder(a: { name: string; email: string }, b: { name: string; email: string }) {
  return rank(a.email) - rank(b.email) || a.name.localeCompare(b.name)
}
