// The teams we scout. One list, so the scouting form's dropdown and RadRank's
// table can never disagree about who is at this competition.
//
// A team not on this list is still scoutable — the form has an "Other team"
// option that takes a number, and RadRank shows those under Other Teams. This
// is the shortlist, not a fence.
export const ALL_TEAMS = [
  { number: '367', name: 'Organized Chaos' },
  { number: '4177', name: 'Finger Tightans' },
  { number: '4237', name: 'Cyberhawks' },
  { number: '5062', name: 'Mechanaries' },
  { number: '6072', name: 'Wildbot Robotics' },
  { number: '6093', name: 'Deviation From The Norm' },
  { number: '6458', name: 'Burgbots' },
  { number: '6545', name: 'Knight Riders' },
  { number: '6603', name: 'Guild of Gears' },
  { number: '8588', name: 'Finger Puppet Mafia' },
  { number: '8672', name: 'UBett' },
  { number: '8696', name: 'Trobotix' },
  { number: '8743', name: 'Raw Bacon' },
  { number: '8813', name: 'The Winter Soldiers' },
  { number: '8988', name: 'Bellevue Blockheads' },
  { number: '10082', name: 'Mechanicats' },
  { number: '10139', name: 'Glitch Mob' },
  { number: '10602', name: 'Pioneer Robotics' },
  { number: '11721', name: 'Central Processing Units' },
  { number: '12745', name: 'Long John Launchers' },
  { number: '13532', name: 'EagleBots FRC 13532' },
  { number: '15050', name: 'Lightning Bots' },
  { number: '15055', name: 'DeDucktive Thinkers' },
  { number: '18482', name: 'Mechanical Soup' },
  { number: '20097', name: 'Robo Raptors' },
  { number: '22064', name: 'ThunderBots' },
  { number: '22479', name: 'Royal Robots' },
  { number: '23971', name: 'Trobotix JV' },
  { number: '24296', name: 'TopBot' },
  { number: '25656', name: 'Pioneer Robotics' },
  { number: '25788', name: 'Byte Brawlers' },
  { number: '31541', name: 'Davenport West' },
  { number: '32494', name: 'Screw Ups-Washington Middle School' },
  // Practice day (Wisconsin) — names from ftc-events.firstinspires.org.
  { number: '4115', name: 'Highland Kilts' },
  { number: '4116', name: 'Volta Robotics' },
  { number: '7974', name: 'Great Scott!' },
  { number: '8680', name: 'Kraken-Pinion' },
  { number: '9224', name: 'Techno G.O.A.T.S.' },
  { number: '9225', name: 'Dynamite Social Club' },
  { number: '13201', name: 'Team Hazmat' },
  { number: '14631', name: 'Laser Tech' },
  { number: '16460', name: 'GEarheads' },
  { number: '20293', name: 'Laser Bots' },
  { number: '21180', name: 'Error 418' },
  { number: '26691', name: 'THUNDERHeads' },
]

export const TEAM_BY_NUMBER = Object.fromEntries(ALL_TEAMS.map(t => [t.number, t.name]))
export const teamLabel = (number) =>
  TEAM_BY_NUMBER[String(number)] ? `${number} — ${TEAM_BY_NUMBER[String(number)]}` : String(number)
