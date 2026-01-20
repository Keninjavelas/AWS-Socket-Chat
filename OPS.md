# ⚙️ Operations Manual: Start & Stop Protocol

This document contains the CLI commands required to "Wake Up" (Start) and "Hibernate" (Stop) the infrastructure. 

**Use this to avoid unnecessary AWS costs when the project is not in use.**

---

## 🛠️ Phase 0: Setup Variables
*Run this block first to set up your environment whenever you open a new terminal.*

```powershell
$Env:AWS_REGION = "us-east-1"
$CLUSTER_NAME = "chat-cluster"
$SERVICE_NAME = "chat-service"
$SG_NAME = "ecs-chat-sg"

```

---

## 🟢 Protocol A: WAKE UP (Start Project)

*Use this when you want to show the project to a recruiter or test it.*

### Step 1: Launch the Hardware (EC2)

This launches a `t3.micro` instance and connects it to the ECS Cluster via the `user-data.sh` script.

```powershell
# 1. Get the latest ECS-Optimized AMI
$AMI_ID = aws ssm get-parameters --names /aws/service/ecs/optimized-ami/amazon-linux-2/recommended/image_id --region $Env:AWS_REGION --query Parameters[0].Value --output text

# 2. Get your Security Group ID
$SG_ID = aws ec2 describe-security-groups --filters Name=group-name,Values=$SG_NAME --query "SecurityGroups[0].GroupId" --output text

# 3. Launch the Instance (Make sure user-data.sh is in your folder!)
aws ec2 run-instances `
    --image-id $AMI_ID `
    --count 1 `
    --instance-type t3.micro `
    --iam-instance-profile Name=ecsInstanceRole `
    --security-group-ids $SG_ID `
    --user-data file://user-data.sh

```

### Step 2: Start the Software

Tell ECS to schedule 1 task on the new instance.

```powershell
aws ecs update-service `
    --cluster $CLUSTER_NAME `
    --service $SERVICE_NAME `
    --desired-count 1

```

### Step 3: Get the Live Link

*Wait ~60 seconds for the instance to boot, then run:*

```powershell
aws ec2 describe-instances `
    --filters "Name=instance-state-name,Values=running" `
    --query "Reservations[*].Instances[*].PublicIpAddress" `
    --output text

```

*(Copy the IP and paste it in your browser)*

---

## 🛑 Protocol B: HIBERNATE (Stop Project)

*Use this immediately after you are done demonstrating to prevent billing.*

### Step 1: Stop the Software

This stops the container so ECS doesn't try to restart it.

```powershell
aws ecs update-service `
    --cluster $CLUSTER_NAME `
    --service $SERVICE_NAME `
    --desired-count 0

```

### Step 2: Terminate the Hardware

This destroys the EC2 instance to stop the per-hour billing.

```powershell
# 1. Find the Running Instance ID
$INSTANCE_ID = aws ec2 describe-instances --filters "Name=instance-state-name,Values=running" --query "Reservations[*].Instances[*].InstanceId" --output text

# 2. Kill It
if ($INSTANCE_ID) {
    aws ec2 terminate-instances --instance-ids $INSTANCE_ID
    Write-Host "Instance $INSTANCE_ID terminating..."
} else {
    Write-Host "No running instances found."
}

```

### Step 3: Verification (The "Sleep Well" Check)

Ensure this returns **nothing** (or only `terminated` instances).

```powershell
aws ec2 describe-instances --filters "Name=instance-state-name,Values=running" --query "Reservations[*].Instances[*].InstanceId"
```

### Notes:
1. The "New IP" Quirk
Every time you run Protocol A (Wake Up), AWS will give you a new Public IP address.

Impact: The old link (e.g., http://3.80.x.x) you saved in your browser history will not work. You must always copy the new IP generated in Step 3.

Why? We didn't use an "Elastic IP" (Static IP) because AWS creates a small charge for them if they are not attached to a running instance, and we want this project to be $0.00 risk.

2. Data Persistence (Don't Panic)
When you run Protocol B (Hibernate) and terminate the EC2 instance, you are destroying the computer, but NOT the data.

Impact: Your chat history lives in DynamoDB, which is a separate serverless service.

Result: When you wake the project up 3 months from now, all the old messages will still be there.

---
## ☢️ Protocol C: NUCLEAR (Total Teardown)
*WARNING: This deletes ALL data, history, and infrastructure permanently.*

```powershell
# 1. Delete Service
aws ecs delete-service --cluster $CLUSTER_NAME --service $SERVICE_NAME --force

# 2. Delete Cluster
aws ecs delete-cluster --cluster $CLUSTER_NAME

# 3. Delete Repository (Images)
aws ecr delete-repository --repository-name chat-repo --force

# 4. Delete DynamoDB Table (Chat History)
aws dynamodb delete-table --table-name ChatHistory

# 5. Delete Security Group
aws ec2 delete-security-group --group-name $SG_NAME
