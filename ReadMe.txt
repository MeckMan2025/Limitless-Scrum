App Name: Everything That's Scrum
==================================

Problem Statement
=================

People on our robotics team get left out and don't know what to do during team meetings. Our scrum board is chaotic and unorganized.

Solution
--------
An organized scrum board app that:
- Ensures no one gets left out
- Helps team members know exactly what tasks they should be doing during meetings
- Matches tasks to people's interests so work feels fun, not forced

Team Structure
--------------
- Team size: 25 people
- 3 Team Leaders (create and assign tasks):
  - Technical Team Leader
  - Business Team Leader
  - Overall Team Leader
- 22 Team Members (view and work on tasks)

Task Matching System
--------------------
- Team members create profiles with their skills and interests
- Leaders tag tasks with required skills/interests
- App matches tasks to people based on both

Platform
--------
- Responsive web app (mobile-friendly)

Task Workflow (Board Columns)
-----------------------------
- To Do → 25% → 50% → 75% → Done

Notifications
-------------
- Reminders when deadlines approach
- Alerts when assigned a new task
- Tasks have due dates

Authentication
--------------
- Google Sign-In

Task Features
-------------
- Comments for team discussion
- Anonymous questions (so members can ask without fear)

Team Onboarding
---------------
- Leaders create a team and share a join link/code
- Members join using the link/code
- Supports multiple teams (scalable for other organizations)

Tech Stack
----------
- Frontend: React
- Backend: Firebase
  - Authentication (Google Sign-In)
  - Firestore (real-time database)
  - Cloud Messaging (push notifications)

Design Theme
------------
- Pastel color scheme: Blue, Pink, Orange
- Friendly and fun aesthetic

Dashboard & Reports
-------------------
- View who has the most tasks (workload balance)
- Team progress overview
- Overdue tasks list
