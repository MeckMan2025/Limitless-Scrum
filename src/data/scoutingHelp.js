// What each scouting question means, in the words the glossary uses.
//
// Shown behind the (i) button on both forms, one section at a time, so a
// scout who is unsure what "Cycle Count" or "Defense Resistance" wants can
// find out without leaving the match. Keyed by field key; a field with no
// entry here falls back to its hint. `enter` is what goes in the box,
// `means` is what the answer is for.

export const MATCH_SECTION_NOTES = {
  'Match': 'One row per team per match, filled in while you watch that one robot. Nearly everything is required: a half-filled row cannot be averaged against a full one, so if you did not see something, say so in Comments rather than guess.',
  'Autonomous': 'The first 30 seconds, with the robot driving itself.',
  'Teleop': 'The driver-controlled period.',
  'Defense': 'How they played, and were played, defensively.',
  'Endgame': 'The last 30 seconds.',
  'Ratings': 'Your judgement. 1 is poor and 5 is excellent.',
  'Problems': 'Fouls and failures.',
  'Notes': 'Anything the numbers do not say.',
}

export const MATCH_HELP = {
  team_number: { enter: 'Team number', means: 'The robot you are watching, not your alliance. On a live day the board fills this in for you.' },
  match_number: { enter: 'Match number', means: 'The qualification or playoff match as the field display shows it.' },
  start_position: { enter: 'Tap a wall tile on the map', means: 'The tile the robot starts on. The rules say a robot starts touching the perimeter wall, on its own half (columns A to C for red, D to F for blue), not in the loading zone and not touching a flower. Those legal tiles are the ones you can tap, named by the field grid, like A6 or F3.' },
  auto_shot: { enter: 'Count', means: 'Every game piece the robot tried to score in auto, whether or not it went in.' },
  auto_made: { enter: 'Count', means: 'How many of those actually scored. Made can never be more than Shot.' },
  auto_leave: { enter: 'Yes / No', means: 'Did the robot move off its starting spot during auto? Just moving counts.' },
  auto_park: { enter: 'Yes / No', means: 'Did the robot end auto parked in a parking zone?' },
  auto_tips: { enter: 'Count', means: 'How many times they tipped the hive during auto. A hive tip is the 20-point score, and the number of tips across the match is what the Pollinator ranking points count.' },
  auto_reliability: { enter: '0 to 100 percent', means: 'How much of what the auto was clearly trying to do actually worked. A routine that ran start to finish is 100. One that drove into the wall is 0.' },
  auto_notes: { enter: 'Free text, optional', means: 'Anything that explains the numbers: a path, a collision, an auto that did nothing.' },
  teleop_shot: { enter: 'Count', means: 'Every scoring attempt during teleop.' },
  teleop_made: { enter: 'Count', means: 'How many of those scored.' },
  teleop_tips: { enter: 'Count', means: 'How many times they tipped the hive during teleop. Not the robot falling over: a hive tip is the 20-point score.' },
  cycle_count: { enter: 'Count', means: 'Completed trips: collect a piece, score it, come back. Count a cycle when the piece is scored.' },
  avg_cycle_sec: { enter: 'Seconds', means: 'Your rough feel for how long one cycle took. Ten seconds is fast, forty is slow. Do not time it, estimate it.' },
  teleop_notes: { enter: 'Free text, optional', means: 'Anything about how they drove: a favourite route, a mechanism that jammed.' },
  defense: { enter: 'None / Some / Strong', means: 'How much of the match they spent blocking or pushing the other alliance instead of scoring.' },
  defense_resistance: { enter: '0 to 100 percent', means: 'How well they kept scoring when the other alliance defended them. Not defended at all? Leave it high and say so in Comments.' },
  endgame: { enter: 'Tick all that apply', means: 'Everything they did in the endgame. Nothing cancels the others.' },
  endgame_shot: { enter: 'Count', means: 'Every scoring attempt during the last 30 seconds, the same way as auto and teleop.' },
  endgame_made: { enter: 'Count', means: 'How many of those scored. Made can never be more than Shot.' },
  garden_score: { enter: 'Count', means: 'How many pieces they scored in the garden during the endgame.' },
  parking: { enter: 'None / Partial / Full', means: 'Where the robot finished: not in the zone, partly over the line, or fully inside.' },
  flowers_owned: { enter: 'Tap on the field map, optional', means: 'Which of the four flower spots, Left to Right, their alliance held when the buzzer went.' },
  rp_points: { enter: 'Tick what the results screen shows, or None', means: 'Win is 3 points, Tie 1. Swarm is the auto bonus: leave and park points over the threshold. Pollinator 1 and 2 are the hive-tip bonuses, 4 tips and 7 tips at most events. Each of those is 1 point. None cancels the others.' },
  robot_speed: { enter: '1 to 5', means: 'How quickly the robot moves around the field compared with the others in the match.' },
  driver_skill: { enter: '1 to 5', means: 'How precisely the drivers place the robot: clean lines and quick alignment score high, bumping and overshooting score low.' },
  consistency: { enter: '1 to 5', means: 'Did they do the same thing well all match, or was it good for a minute and then fell apart?' },
  minors: { enter: 'Count', means: 'Small fouls called against them.' },
  majors: { enter: 'Count', means: 'Big fouls called against them.' },
  breakdowns: { enter: 'None / Minor / Major', means: 'Mechanical trouble. Minor is something that slowed them down. Major is something that stopped them scoring.' },
  comments: { enter: 'Free text, required', means: 'Anything unusual, and anything you could not see. One sentence is fine.' },
}

export const PIT_SECTION_NOTES = {
  'Team Info': 'One sheet per team, filled in by talking to them at their pit. It is a conversation, not a stopwatch. Only who the team is, who asked, and a photo are required. Wherever you pick Other, say what the other is.',
  'Robot Basics': 'What the robot is and what it can do, by their account.',
  'Strengths': 'Ask them. They will tell you.',
  'Weaknesses / Risks': 'What breaks, jams, or takes too long.',
  'Autonomous': 'Their routine and how often it runs clean.',
  'TeleOp / Strategy': 'How they want to play.',
  'Reliability': 'How often the robot finishes a match whole.',
  'Drive Team / Communication': 'The people behind the robot.',
  'Alliance Notes': 'Your call, and why. This is what the pick list reads.',
  'Final Notes': 'Whatever did not fit, a photo, and how sure you are.',
}

export const PIT_HELP = {
  team_number: { enter: 'Number, required', means: 'The team whose pit you are in. Known teams fill in their name.' },
  team_name: { enter: 'Text', means: 'Their name. Filled in for you when the number is on our list.' },
  scout_name: { enter: 'Text, required', means: 'You. Filled in from your login.' },
  visited_at: { enter: 'Picker', means: 'When you visited. Set to now when the form opens.' },
  drive_train: { enter: 'Mecanum / Tank / Swerve / Other', means: 'How the robot moves. Mecanum slides sideways on angled rollers. Tank has two sides that turn like a tractor. Swerve has wheels that each steer.' },
  main_scoring: { enter: 'Pick one, or Other', means: 'The one thing the robot uses to score. Shooter launches the piece. Arm swings it into the scoring area. Elevator or Lift raises it straight up. Intake + conveyor collects and feeds pieces into a scorer. Gripper or Claw grabs and places them.' },
  auto_scores: { enter: 'Yes / No / Sometimes', means: 'Their own answer. Sometimes means it works on a good day.' },
  teleop_scores: { enter: 'Yes / No', means: 'Whether the robot can score at all under driver control.' },
  endgame_tasks: { enter: 'Yes / No / Sometimes', means: 'Whether they do anything in the last 30 seconds beyond parking.' },
  strengths: { enter: 'Text', means: 'The one or two things they are proud of.' },
  weaknesses: { enter: 'Text', means: 'What breaks, jams, or takes too long. They will often tell you if asked kindly.' },
  auto_what: { enter: 'Text', means: 'Their routine in a sentence: where it starts, what it scores, where it ends.' },
  auto_consistency: { enter: 'Pick one', means: 'How often that routine runs clean, by their account.' },
  preferred_role: { enter: 'Main scorer / Support / Defense / Flexible', means: 'What they would rather do on an alliance. Main scorer carries the scoring. Support feeds or assists. Defense blocks. Flexible will do any of them.' },
  cycle_speed: { enter: 'Fast / Medium / Slow / Unknown', means: 'How quickly they collect and score one piece, by their account or your look at the robot.' },
  works_around_robots: { enter: 'Yes / Somewhat / No / Unknown', means: 'Whether they can score with traffic around them or need a clear field.' },
  reliability: { enter: 'Pick one', means: 'How often the robot finishes a match without something failing.' },
  known_problems: { enter: 'Text', means: 'Anything broken or being repaired right now.' },
  drive_confidence: { enter: 'High / Medium / Low / Unknown', means: 'How sure of themselves the drivers seem.' },
  communicated_strategy: { enter: 'Yes / Somewhat / No', means: 'Could they explain what they do in a match in plain words? A team that can explain it usually does it.' },
  alliance_pick: { enter: 'Pick one', means: 'Your gut call after the visit. Pick Need more match data if the pit told you little.' },
  alliance_why: { enter: 'Text', means: 'The reason for that call, in a sentence. This is what the pick list reads.' },
  final_notes: { enter: 'Text', means: 'Whatever did not fit above.' },
  photo_url: { enter: 'Camera, required', means: 'Take a photo of the robot in the app. It shows on RadRank beside their numbers.' },
  scout_confidence: { enter: 'High / Medium / Low', means: 'How much you trust your own answers. Low is honest when the team was busy or vague.' },
}
