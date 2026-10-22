// Role reference shown in the User Management "Roles" popup.
// Grouped by side; each role has a short summary, common objectives, and where
// those objectives come from. Edit here to update the in-app role guide.

export const ROLE_GUIDE = [
  {
    category: 'Leadership',
    roles: [
      {
        name: 'Project Manager',
        summary: 'Keeps the entire team organized and ensures projects move from ideas to completion on time. Coordinates people and deadlines but does not make every technical or business decision.',
        objectives: [
          "Create and maintain the team's season schedule.",
          'Turn large goals into smaller, manageable tasks.',
          'Assign each task an owner, priority, and deadline.',
          'Track progress across the technical and business sides.',
          'Run short planning and progress meetings.',
          'Identify delays, missing resources, and overloaded members.',
          'Coordinate work shared by multiple roles.',
          'Inform team leads when deadlines or goals are at risk.',
          'Help the team prepare for competitions, outreach events, and award deadlines.',
        ],
        sources: [
          "The team's season goals",
          'Technical and Business Leads',
          'Coaches and mentors',
          'Competition and event schedules',
          'FIRST award and submission deadlines',
          'Progress updates and problems reported by team members',
        ],
        example: 'If the team needs a working robot before its first competition, the Project Manager helps establish deadlines for CAD, ordering parts, building, wiring, programming, testing, and driver practice. The Technical Lead decides how the robot should work; the Project Manager makes sure the related work stays coordinated and on schedule.',
      },
    ],
  },
  {
    category: 'Business Side',
    roles: [
      {
        name: 'Business Lead',
        summary: "Oversees the team's nontechnical work and coordinates business, outreach, fundraising, communications, and award preparation.",
        objectives: [
          'Create a season-long business plan and calendar.',
          'Assign and monitor business-side projects.',
          'Coordinate award submissions and judging preparation.',
          'Keep the business and technical teams informed.',
          'Make sure important deadlines are met.',
        ],
        sources: [
          'Team goals and leadership meetings',
          'FIRST award requirements and deadlines',
          'Coaches and mentors',
          'Competition and event calendars',
          'Needs reported by other team roles',
        ],
      },
      {
        name: 'Outreach',
        summary: 'Builds relationships with the community and creates opportunities for the team to promote STEM and FIRST.',
        objectives: [
          'Organize robotics demonstrations and workshops.',
          'Visit schools, libraries, community events, or other teams.',
          'Track participation, attendance, and community impact.',
          'Develop lasting partnerships.',
          'Collect photos and information for awards and judging.',
        ],
        sources: [
          'Community needs and requests',
          'Schools and local organizations',
          'FIRST outreach and award criteria',
          'Team outreach goals',
          'Opportunities found by students, parents, and mentors',
        ],
      },
      {
        name: 'Financial',
        summary: "Manages the team's budget, purchases, fundraising records, and sponsor contributions.",
        objectives: [
          'Create and regularly update the team budget.',
          'Record income and expenses.',
          'Process purchase requests.',
          'Help organize fundraisers and sponsorship campaigns.',
          'Prepare financial information for the business plan.',
        ],
        sources: [
          'Robot parts and equipment requests',
          'Registration and travel costs',
          "The team's available funds",
          'School or nonprofit financial rules',
          'Fundraising goals established by team leadership',
        ],
      },
      {
        name: 'Communications',
        summary: 'Manages written communication, the team website, and social media, keeping the team’s public image professional and current.',
        objectives: [
          'Share schedules, deadlines, and team announcements.',
          'Write professional emails and thank-you messages.',
          'Contact sponsors, event organizers, and community partners.',
          'Maintain consistent team messaging.',
          'Update the team website with member, sponsor, event, and robot info.',
          'Post about meetings, outreach, sponsors, and competitions on social media.',
          'Recognize sponsors and community partners online.',
        ],
        sources: [
          'Team leaders and mentors',
          'Upcoming events and deadlines',
          'Sponsor and partner questions',
          'Parents, schools, and event organizers',
          'Team branding and safety policies',
        ],
      },
    ],
  },
  {
    category: 'Technical Side',
    roles: [
      {
        name: 'Technical Lead',
        summary: 'Coordinates the design, construction, programming, testing, and improvement of the robot.',
        objectives: [
          "Turn the team's game strategy into technical requirements.",
          'Divide projects among technical groups.',
          'Lead design reviews and major technical decisions.',
          'Track robot readiness, reliability, and testing.',
          'Coordinate with the drive team and business team.',
        ],
        sources: [
          'The official FRC game manual',
          'Team strategy and scoring priorities',
          'Testing and match results',
          'Technical team members',
          'Coaches, mentors, and inspection requirements',
        ],
      },
      {
        name: 'Assembly/Building',
        summary: "Manufactures, assembles, repairs, and improves the robot's physical mechanisms.",
        objectives: [
          'Build mechanisms according to approved designs.',
          'Measure and assemble parts accurately.',
          'Keep the robot strong, safe, and easy to repair.',
          'Perform maintenance and competition repairs.',
          'Report design or manufacturing problems.',
        ],
        sources: [
          'CAD drawings and design reviews',
          'Technical lead and mechanism owners',
          'Testing results and driver feedback',
          'Robot inspection requirements',
          'Damage or failures found during operation',
        ],
      },
      {
        name: 'CAD',
        summary: 'Creates digital models and drawings so the team can plan, evaluate, and manufacture robot components.',
        objectives: [
          'Model the complete robot and individual mechanisms.',
          'Check clearances, dimensions, and part compatibility.',
          'Produce drawings or files for manufacturing.',
          'Maintain organized and updated design files.',
          'Document important design changes and decisions.',
        ],
        sources: [
          'Game strategy and robot requirements',
          'Ideas developed during design meetings',
          'Measurements of existing components',
          'Feedback from builders and programmers',
          'Testing results and design reviews',
        ],
      },
      {
        name: 'Programming',
        summary: 'Develops and tests the software controlling the robot during autonomous and driver-controlled periods.',
        objectives: [
          'Program motors, servos, and sensors.',
          'Create reliable autonomous routines.',
          'Build clear and responsive driver controls.',
          "Test, debug, and document the robot's software.",
          'Use version control and keep backup copies.',
        ],
        sources: [
          'The official game rules',
          'Drive-team strategy',
          'Robot hardware and mechanism requirements',
          'Testing data and driver feedback',
          'Technical lead and competition performance',
        ],
      },
      {
        name: 'Wiring',
        summary: "Installs and maintains the robot's electrical system so every device receives reliable power and communication.",
        objectives: [
          'Connect motors, sensors, servos, hubs, and batteries correctly.',
          'Route and secure wires safely.',
          'Label important cables and ports.',
          'Diagnose electrical and connection problems.',
          'Maintain batteries and prepare electrical spare parts.',
        ],
        sources: [
          'The robot design and CAD layout',
          'FRC electrical and inspection rules',
          'Requirements from builders and programmers',
          'Problems discovered during testing',
          'Technical lead and hardware documentation',
        ],
      },
    ],
  },
  {
    category: 'Shared Roles',
    roles: [
      {
        name: 'Scouting',
        summary: 'Collects and analyzes information about teams and matches to support strategy and alliance selection.',
        objectives: [
          'Record robot capabilities and match performance.',
          "Identify teams' strengths, weaknesses, and reliability.",
          'Prepare information for upcoming match strategy.',
          'Create alliance-selection rankings and recommendations.',
          'Check collected information for accuracy.',
        ],
        sources: [
          'Competition schedules and match observations',
          'Drive-team and strategy needs',
          'Official match results',
          'Conversations with other teams',
          'Questions established by team leadership',
        ],
      },
      {
        name: 'Scrummers',
        summary: 'Undecided — new role. Details coming soon.',
        objectives: [],
        sources: [],
      },
    ],
  },
]
