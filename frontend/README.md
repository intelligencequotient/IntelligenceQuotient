# IQ Student Profile & Educational Analytics Platform

A modern, high-performance web application designed for students and educators. Built with **React 19**, **Vite 8**, **React Router v7**, and **Recharts**, this platform provides a dual-portal interface: a student-centric learning dashboard with real-time doubt resolution and interactive analytics, alongside a comprehensive teacher portal for cohort management and assessment tools.

---

## ⚡ How to Run the Project

### 1. Prerequisites
Make sure you have **Node.js** (v18 or higher) and **npm** installed on your system.

### 2. Installation
Clone the repository and install all project dependencies:
```bash
git clone https://github.com/vaibhav010606/IQ_student_profile.git
cd IQ_student_profile
npm install
```

### 3. Start Development Server
Run the following command to start the Vite local dev server:
```bash
npm run dev
```
Open your browser and navigate to:
👉 **[http://localhost:5173](http://localhost:5173)**

---

## 📜 All Available NPM Scripts

| Command | Action |
| :--- | :--- |
| `npm run dev` | Starts the Vite dev server with Hot Module Replacement (HMR) at `localhost:5173` |
| `npm run build` | Compiles and bundles the app for production in the `/dist` directory |
| `npm run preview` | Serves the production build locally to test performance before deployment |
| `npm run lint` | Runs **Oxlint** to analyze code for potential errors and styling warnings |

---

## 🚀 Key Features

### 🎓 **Student Portal**
* **Dashboard**: Personalized learning portal displaying upcoming exam countdowns, subject-wise progress cards, and quick activity feeds.
* **Subject Hubs**: Dedicated landing pages for **Physics**, **Chemistry**, and **Mathematics** with topic breakdowns, study materials, and module tracking.
* **Analytics Hub**: Interactive visual analytics powered by Recharts featuring accuracy trends, subject strength radar, speed metrics, and topic weakness diagnosis.
* **Live Doubt Resolution**: Real-time doubt asking client with chat interface, code/equation snippets, and status tracking.
* **Leaderboard & Gamification**: Weekly/Monthly student rankings, XP points, streak counters, and badge showcases.
* **Assessment Arena**: Standardized test execution screen inside a dedicated `LockedLayout` (distraction-free testing mode).

### 👩‍🏫 **Teacher & Admin Portal**
* **Teacher Dashboard**: High-level overview of cohort metrics, pending doubts, and test completion rates.
* **Test Constructor**: Dynamic tool for creating custom tests, question banks, and setting difficulty levels.
* **Cohort Analytics**: Deep analytics into overall batch performance, question item-response distributions, and strength maps.
* **Student CRM**: Comprehensive directory for tracking individual student profiles, attendance, and performance histories.
* **Doubt Queue**: Dedicated interface for teachers to view, filter, assign, and answer student doubts in real-time.
* **CSV Batch Upload**: Tool to batch import students, question banks, and marks.

---

## 🛠️ Technology Stack

| Category | Technology |
| :--- | :--- |
| **Core Framework** | React 19 (`v19.2.7`) & React DOM (`v19.2.7`) |
| **Build System** | Vite 8 (`v8.1.1`) with `@vitejs/plugin-react` |
| **Routing** | React Router v7 (`v7.18.1`) |
| **Data Visualization** | Recharts (`v3.9.2`) |
| **Iconography** | Lucide React (`v1.25.0`) |
| **Styling** | Modular Vanilla CSS (Design Tokens, Dark/Light Themes) |
| **Code Quality** | Oxlint (`v1.71.0`) |

---

## 📂 Project Architecture

```text
├── public/                # Static assets & icons
├── src/
│   ├── assets/            # Images, SVGs, and brand assets
│   ├── layouts/
│   │   ├── MainLayout.jsx  # Primary app shell with responsive sidebar & theme switching
│   │   ├── MainLayout.css  # Sidebar and main viewport styling
│   │   └── LockedLayout.jsx# Distraction-free shell for active assessments
│   ├── pages/
│   │   ├── Settings.jsx   # Profile & system preferences
│   │   ├── student/       # Student Portal pages
│   │   │   ├── StudentDashboard.jsx
│   │   │   ├── SubjectLanding.jsx
│   │   │   ├── AnalyticsHub.jsx
│   │   │   ├── LiveDoubtClient.jsx
│   │   │   ├── Leaderboard.jsx
│   │   │   ├── AssessmentArena.jsx
│   │   │   └── PostTestResult.jsx
│   │   └── teacher/       # Teacher & Admin Portal pages
│   │       ├── TeacherDashboard.jsx
│   │       ├── TestConstructor.jsx
│   │       ├── CohortAnalytics.jsx
│   │       ├── StudentCRM.jsx
│   │       ├── DoubtQueue.jsx
│   │       └── CSVUpload.jsx
│   ├── App.jsx            # React Router v7 application routes configuration
│   ├── main.jsx           # Application entrypoint
│   └── index.css          # Global styling tokens & resets
├── vite.config.js         # Vite bundler configuration
└── package.json           # Dependencies and project scripts
```

---

## 📄 License
This project is licensed under the MIT License.
