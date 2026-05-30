# ✂️ Agendador Pro - Intelligent Barbershop Management System

[![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://react.dev/)
[![Firebase](https://img.shields.io/badge/firebase-ffca28?style=for-the-badge&logo=firebase&logoColor=black)](https://firebase.google.com/)
[![Tailwind CSS](https://img.shields.io/badge/tailwindcss-%2338B2AC.svg?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Vite](https://img.shields.io/badge/vite-%23646CFF.svg?style=for-the-badge&logo=vite&logoColor=white)](https://vite.dev/)

**Agendador Pro** is a complete ecosystem for barbershop management and real-time automated scheduling. Engineered to handle end-to-end business operations, the platform integrates three distinct access roles into a single Single Page Application (SPA), ensuring robust security, high visual fidelity (Premium Dark Mode), and global reactive data synchronization.

---

## 💻 Dashboard Architecture

The system dynamically toggles the user interface based on authentication status and database privilege rules.

### 1. 🧑‍💻 Client Dashboard
Focused on fast mobile usability and clean User Experience (UX).
* **Dynamic History:** Real-time visualization of upcoming appointments with a built-in cancellation option if performed safely within the permitted timeframe.
* **Cancellation Lockdown:** Automatically detects and prevents cancellations requested less than 1 hour prior to the appointment, seamlessly redirecting the client to WhatsApp support.
* **Step-by-Step Scheduling Flow:** Select Barber ➔ Choose available date ➔ Pick integrated services ➔ Select chained time slots.

### 2. 💈 Professional Dashboard (Barber)
A tactical administrative panel for daily routine management and schedule control.
* **Collapsible Tabs (Accordion UI):** Clean separation between confirmed appointments, day-off management, and custom slot lockouts.
* **Adaptive Calendar Management:** Allows barbers to browse months ahead to apply full-day blocks (*Day Off*) or lock specific hourly slots within a few clicks.
* **Direct Communication:** Seamless integration with the WhatsApp API to contact registered clients instantly right from their appointment line.

### 3. 👑 Super ADM Dashboard
A master control panel for managing professionals registered across the franchise or establishment.
* **Status Control:** Instantly activate or suspend access for any barber, immediately reflecting on their authentication state.
* **Provisioning:** Centralized creation of professional credentials, setting up access emails, and specialties directly from the panel.

---

## 🛠️ Tech Stack

The project was built using modern front-end engineering tools to guarantee scalable performance:

| Technology | Description | Project Application |
| :--- | :--- | :--- |
| **React 18** | Core Library | Component-based rendering architecture and granular global state management. |
| **Vite** | Build Tooling | Ultra-fast bundler delivering efficient Hot Module Replacement (HMR) and optimized build environments. |
| **Firebase Auth** | Authentication | Secure session handling, resilient user logins, and token validation. |
| **Firestore** | NoSQL Database | Cloud database acting with local cache persistence and continuous live data listening listeners. |
| **Tailwind CSS v4** | Utility-First Styling | Custom fluid responsive layout and implementation of a high-contrast dark space theme. |
| **Lucide React** | Icon Package | Modern, lightweight vector iconography streamlining UI visual cues. |

---

## 🚀 Technical Challenges Solved

During the development cycle, complex business logic constraints were translated into clean code, resolving critical architectural bottlenecks:

### 🔄 Real-Time Synchronization (Firestore `onSnapshot`)
Instead of overloading the server with repetitive HTTP requests (`fetch`/`axios`) on every click, the system leverages native WebSocket connections using `onSnapshot`. Whenever a client books a slot or an administrator locks a date, mutations propagate across all active screens in milliseconds, eliminating **duplicate booking conflicts (Overbooking)**.

### 🛡️ Authentication Filtering & UID Synchronization
A key challenge solved was preventing inconsistencies during professional registration. On initialization (`onAuthStateChanged`), the application evaluates whether the Firestore user document aligns with the encrypted Firebase Auth credentials, ensuring that professionals pre-registered by the Super ADM automatically inherit their security access rules on their first login attempt.

### 📅 Multi-Month Date Validation via Native Time Objects (`Date`)
The initial framework evaluated dates using purely text strings, causing calendar updates to hide future monthly data from the barbers' view due to how JavaScript sequentially sorts string text alphabetically (e.g., evaluating `"01/07/2026"` as smaller than `"27/05/2026"`). The algorithm was refactored to split strings into numeric arrays and map them into proper integer timestamps (`new Date(year, month, day)`), enabling flawless cross-month filtering and future scheduling support.

### 🔐 Multi-Write Atomic Operations via Batches
Bulk write tasks (such as setting a *Day Off*, which requires generating multiple concurrent restriction entries) were refactored to implement Firestore `writeBatch`. This ensures **atomicity**: either all selected days are securely blocked together, or the entire operation rolls back, preventing corrupt database states.

---

## 📦 Local Installation & Setup

1. Clone the repository:

   ```bash
   git clone [https://github.com/RobsonAndrade1/agendador-pro.git](https://github.com/RobsonAndrade1/agendador-pro.git)

2. Install dependencies:

    npm install

3. Create a .env file in the root directory with your Firebase configuration:

    VITE_EMAIL_SUPER_ADM=your_adm_email@example.com
    VITE_VAPID_KEY=your_fcm_vapid_key
    # Include standard Firebase SDK keys below

4. Fire up the local development server:

    npm run dev

Developed with dedication by Robson Andrade 🚀