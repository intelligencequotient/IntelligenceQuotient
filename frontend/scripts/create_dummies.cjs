const fs = require('fs');
const path = require('path');

const studentPages = ['StudentDashboard', 'SubjectLanding', 'AssessmentArena', 'PostTestResult', 'AnalyticsHub', 'LiveDoubtClient', 'Leaderboard'];
const teacherPages = ['TeacherDashboard', 'TestConstructor', 'CSVUpload', 'CohortAnalytics', 'StudentCRM', 'DoubtQueue'];

const createComponent = (name, folder) => {
  const dir = path.join(__dirname, 'src/pages', folder);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${name}.jsx`), `import React from 'react';\n\nconst ${name} = () => { return <div style={{padding: '24px'}}><h1>${name}</h1><p>Draft screen placeholder.</p></div>; };\n\nexport default ${name};`);
};

studentPages.forEach(p => createComponent(p, 'student'));
teacherPages.forEach(p => createComponent(p, 'teacher'));
