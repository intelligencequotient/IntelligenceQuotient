# IQ Platform Setup Guide

This guide is split into two parts: **Part 1** is for you (the developer), and **Part 2** is for your friend (the user).

---

## Part 1: What YOU need to do (Upload to Docker Hub)

Your goal is to build the application into "images" and upload them to Docker Hub so your friend doesn't have to deal with the source code.

### Step 1: Start Docker Desktop
1. Open your Windows Start menu and search for **Docker Desktop**.
2. Open it and wait for the engine to fully start (the whale icon in your taskbar will stop animating and turn green/solid).

### Step 2: Log into Docker in your Terminal
1. Open your VS Code terminal.
2. Run this command to ensure you are logged into your `vaibhav010606` account:
   ```bash
   docker login
   ```

### Step 3: Run the Publish Script
I created a script in your folder called `publish.bat` that does all the heavy lifting.
1. Open your File Explorer.
2. Navigate to your project folder: `c:\Users\vaibh\OneDrive\Documents\code\IQ`.
3. Double-click **`publish.bat`**.
4. Wait for the black terminal window to finish processing. It will automatically build all 4 parts of your app and upload them securely to your Docker Hub account.

> [!NOTE]
> If any errors occur, make sure Docker Desktop is still running in the background.

---

## Part 2: What YOUR FRIEND needs to do (Download and Run)

Since you uploaded the pre-built images to Docker Hub, your friend does NOT need to run any build commands. They just need to download your images and start them.

### Step 1: Install Docker Desktop
Ask your friend to download and install **Docker Desktop** from [docker.com](https://www.docker.com/products/docker-desktop/). They must have it open and running in the background.

### Step 2: Create a simple `docker-compose.yml`
Your friend doesn't need all your source code. They only need to create a folder on their computer, and put **two files** inside it. 
First, have them create a file named `docker-compose.yml` and paste this exact code inside:

```yaml
version: '3.8'

services:
  redis:
    image: redis:7-alpine
    restart: unless-stopped
    ports:
      - "6379:6379"

  backend:
    image: vaibhav010606/iq-backend:latest
    restart: unless-stopped
    ports:
      - "3000:3000"
    env_file:
      - .env
    depends_on:
      - redis

  frontend:
    image: vaibhav010606/iq-frontend:latest
    restart: unless-stopped
    ports:
      - "8080:80"
    depends_on:
      - backend
```
*(Note: If they also want the `exam` app, you can add those image links in here too!)*

### Step 3: Create the `.env` file
In that same folder, have them create a file named `.env` and paste in your database credentials:

```properties
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
REDIS_URL=redis://redis:6379
```
*(Make sure you replace the Supabase placeholder values with your real keys before sending this to them!)*

### Step 4: Start the App!
1. Have your friend open a terminal in that folder.
2. Run this single command:
   ```bash
   docker compose up -d
   ```
Docker will automatically reach out to your Docker Hub (`vaibhav010606`), download the application, and start it. They can then open their web browser and go to `http://localhost:8080` to see your app!
