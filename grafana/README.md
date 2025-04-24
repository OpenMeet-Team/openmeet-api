# OpenMeet Metrics and Dashboards

This directory contains Grafana dashboard configurations for monitoring your OpenMeet instances.

## Metrics Dashboard

The `openmeet-metrics-dashboard.json` file contains a dashboard configuration for monitoring the metrics collected by the OpenMeet API's MetricsService.

## Metrics Collection

OpenMeet API exposes the following metrics on the `/metrics` endpoint:

- `users_total` - Total number of registered users per tenant
- `active_users_30d` - Number of active users in the last 30 days per tenant
- `events_total` - Total number of events per tenant
- `event_attendees_total` - Total number of event attendees per tenant
- `groups_total` - Total number of groups per tenant
- `group_members_total` - Total number of group members per tenant

## Setting Up Amazon Managed Prometheus (AMP)

To send metrics to Amazon Managed Prometheus:

1. Create an AMP workspace in your AWS account
2. Configure the AWS Distro for OpenTelemetry (ADOT) Collector or Prometheus using the provided `prometheus-amp-config.yaml` file
3. Update the configuration file with your:
   - AWS Region
   - AMP workspace URL
   - AWS credentials with appropriate permissions

Example:
```yaml
remote_write:
  - url: 'https://aps-workspaces.us-east-1.amazonaws.com/api/v1/remote_write'
    sigv4:
      region: us-east-1
```

## Connecting Grafana to AMP

1. In Grafana, add a new Prometheus data source
2. Configure it to connect to your AMP workspace:
   - URL: `https://aps-workspaces.YOUR_REGION.amazonaws.com/api/v1/query`
   - Auth type: `AWS SigV4`
   - AWS Region: Your AMP workspace region
   - Authentication Provider: `Access & secret key` or `Workspace IAM Role`
   - Enter appropriate AWS credentials

## Importing the Dashboard

1. Open your Grafana instance
2. Go to Dashboards > Import
3. Upload `openmeet-metrics-dashboard.json` or paste its contents
4. Select your AMP data source in the dashboard variable
5. Click "Import"

## Troubleshooting

If you don't see any data in your dashboard:

1. Verify metrics are exposed at `http://your-api:3000/metrics`
2. Check the ADOT/Prometheus configuration is correctly set up
3. Confirm AWS permissions are correctly configured
4. Check the Grafana data source is properly connected to AMP
5. Verify the dashboard is using the correct data source variable 