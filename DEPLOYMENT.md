# Meet-AI: ECR + EC2 Deployment Guide

Deploy your Next.js application using **GitHub Actions** to build Docker images, **AWS ECR** as the image registry, and **AWS EC2** to run the containers. This pipeline ensures EC2 never builds anything — it only pulls and runs the pre-built image.

---

## 🏗️ Architecture Overview

```
Push to main
  → GitHub Actions lints and builds Docker image (7 GB RAM, ~3 min)
  → Pushes image to AWS ECR (free 500 MB storage)
  → SSHs into EC2
  → EC2 pulls the pre-built image from ECR
  → EC2 restarts containers via docker-compose.prod.yml (~30 sec)
```

---

## 🚀 Step 1: Launch your Free EC2 Instance
1. Sign in to the **AWS Management Console** and navigate to **EC2**.
2. Click **Launch instance**:
   - **Name:** `meet-ai-server`
   - **AMI:** Ubuntu Server 24.04 LTS (Free tier eligible).
   - **Instance Type:** `t2.micro` or `t3.micro` (Free tier eligible).
   - **Key Pair:** Create `meet-ai-key.pem` and download it.
   - **Security Group:** Allow SSH (Port 22), HTTP (Port 80), and Custom TCP Port `3000` from `Anywhere-IPv4`.
3. Click **Launch instance**.
4. Note your instance's **Public IPv4 Address**.

---

## 📦 Step 2: Create your Amazon ECR Repository
1. Navigate to **Elastic Container Registry (ECR)** in the AWS Console.
2. Click **Create repository**:
   - **Visibility:** Private.
   - **Name:** `meet-ai`.
3. Click **Create repository**.
4. Note down the **Repository URI** and your **12-digit AWS Account ID** from the top-right corner of the console.

---

## 🔐 Step 3: Create an IAM User for GitHub Actions
GitHub Actions needs permission to push images to ECR:
1. Go to **IAM** → **Users** → **Create user**.
2. **Name:** `github-actions-deployer`.
3. Attach the following policies directly:
   - `AmazonEC2ContainerRegistryPowerUser` (allows push/pull to ECR).
4. After creating, go to **Security credentials** → **Create access key** → Choose **Application running outside AWS**.
5. Note the **Access Key ID** and **Secret Access Key**.

---

## 🛠️ Step 4: Set up your EC2 Server (One-time Setup)
Connect to your EC2 instance and install Docker and AWS CLI:
```bash
# Secure your key file
chmod 400 meet-ai-key.pem

# SSH into the server
ssh -i meet-ai-key.pem ubuntu@YOUR_EC2_IP

# Install Docker
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y docker.io awscli

# Add ubuntu user to docker group
sudo usermod -aG docker ubuntu
newgrp docker

# Configure AWS CLI so EC2 can authenticate to ECR
aws configure
# Enter: Access Key ID, Secret Access Key, Region (e.g., us-east-1), and default output format (json)
```

Then clone the repository and create your `.env` file:
```bash
git clone https://github.com/YOUR_GITHUB_USERNAME/Final_Year_Project.git
cd Final_Year_Project
nano .env
# Paste all your environment variables and save (Ctrl+O, Enter, Ctrl+X)
```

> [!TIP]
> Make sure `REDIS_URL=redis://redis:6379` is set in your `.env` file on the server so the web container connects to the Redis sidecar.

---

## 🔄 Step 5: Configure GitHub Repository Secrets
Go to your GitHub repository → **Settings** → **Secrets and variables** → **Actions** → **New repository secret** and add:

| Secret Name | Value |
| :--- | :--- |
| `AWS_ACCESS_KEY_ID` | Your IAM user access key |
| `AWS_SECRET_ACCESS_KEY` | Your IAM user secret key |
| `AWS_REGION` | Your AWS region (e.g., `us-east-1`) |
| `AWS_ACCOUNT_ID` | Your 12-digit AWS Account ID |
| `ECR_REPOSITORY` | `meet-ai` |
| `EC2_HOST` | Your EC2 public IP address |
| `EC2_SSH_KEY` | Full contents of your `meet-ai-key.pem` file |
| `NEXT_PUBLIC_STREAM_API_KEY` | Your GetStream.io public API key |
| `NEXT_PUBLIC_POLAR_ORGANIZATION_ID` | Your Polar.sh organization ID |

---

## ⚡ Step 6: Trigger Your First Deployment
Push your changes to `main` to trigger the full pipeline:
```bash
git add .
git commit -m "chore: configure ECR + EC2 CI/CD pipeline"
git push origin main
```

Your GitHub Actions pipeline will:
1. Lint your application code.
2. Build the Docker image on GitHub's servers (7 GB RAM, very fast).
3. Push the image to Amazon ECR.
4. SSH into your EC2 server and pull the new image.
5. Restart your containers using `docker-compose.prod.yml`.

Visit **`http://YOUR_EC2_IP:3000`** to see your live application.

---

## 🔁 How Updates Work
Every time you push code to `main`, GitHub automatically:
- Builds a new image (tagged with the commit SHA and `latest`).
- Pushes it to ECR.
- Pulls and restarts the containers on EC2.

**Your EC2 instance never needs to compile or build anything.**
