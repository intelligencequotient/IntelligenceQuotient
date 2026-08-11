# How to run the IQ Platform

**Step 1: Install Docker**
First, download and install Docker Desktop from here: https://www.docker.com/products/docker-desktop/
Once installed, open it and make sure it says "Running" in the bottom corner (the whale icon).

**Step 2: Create your files**
Create a new empty folder anywhere on your computer (for example, on your Desktop). 
Inside that new folder, create a file named `docker-compose.yml` and paste this exact code inside it:

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

**Step 3: Add the environment variables**
In that exact same folder, create a second file named `.env` and paste these database keys inside it:

```properties
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
REDIS_URL=redis://redis:6379
```
*(Note from Vaibhav: I'll send you the real Supabase keys separately, just replace the placeholders above with them).*

**Step 4: Start the app**
Open a command prompt (or terminal) inside that folder and run this command:
```bash
docker compose up -d
```
Docker will download everything automatically. Once it finishes, you can open your web browser and go to `http://localhost:8080` to see the app!
