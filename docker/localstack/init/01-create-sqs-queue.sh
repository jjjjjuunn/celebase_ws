#!/bin/bash
# Runs automatically after LocalStack reaches 'running' state.
# Idempotent: create-queue is a no-op if the queue already exists.
set -euo pipefail

awslocal sqs create-queue \
  --queue-name meal-plan-generation \
  --attributes VisibilityTimeout=120,MessageRetentionPeriod=1209600

echo "LocalStack: SQS queue 'meal-plan-generation' ready"
