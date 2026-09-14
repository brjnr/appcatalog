"""Seed the catalog with realistic enterprise applications.

Run: cd /app/backend && python seed.py
Idempotent: clears the apps collection, then re-inserts + re-applies indexes.
"""

import asyncio
import uuid
from datetime import datetime, timedelta, timezone

from lib.db import db, ensure_indexes
from models.catalog import AppCreate

APPS = [
    # Business
    {"name": "Jira Software", "category": "Business", "icon": "SquareCheck", "url": "https://jira.internal.corp", "environment": "Cloud", "status": "Active", "usage_count": 23500, "favorite_count": 1450,
     "description": "Issue tracking, agile sprint planning, and project workflow management for engineering and enterprise operations. Teams plan sprints, track blockers, and ship releases from a single board."},
    {"name": "Salesforce CRM", "category": "Business", "icon": "Briefcase", "url": "https://crm.internal.corp", "environment": "Cloud", "status": "Active", "usage_count": 16500, "favorite_count": 920,
     "description": "Customer relationship management engine tracking the global pipeline, customer accounts, contracts, and revenue. The system of record for every customer-facing conversation."},
    {"name": "Confluence Wiki", "category": "Business", "icon": "BookOpen", "url": "https://confluence.internal.corp", "environment": "Cloud", "status": "Active", "usage_count": 21000, "favorite_count": 1150,
     "description": "Corporate knowledge base, engineering documentation, technical runbooks, and team workspaces. Every process, policy, and post-mortem lives here."},
    {"name": "Tableau Server", "category": "Business", "icon": "ChartColumn", "url": "https://tableau.internal.corp", "environment": "Production", "status": "Active", "usage_count": 14900, "favorite_count": 780,
     "description": "Enterprise executive reporting, business intelligence dashboards, and interactive visual data analytics for every department."},
    {"name": "Asana Enterprise", "category": "Business", "icon": "SquareKanban", "url": "https://asana.internal.corp", "environment": "Cloud", "status": "Active", "usage_count": 11200, "favorite_count": 610,
     "description": "Cross-functional project tracking, operational roadmaps, team task assignment, and portfolio timelines."},
    # Infrastructure
    {"name": "VMware vCenter", "category": "Infrastructure", "icon": "Server", "url": "https://vcenter.internal.corp", "environment": "On-Premises", "status": "Active", "usage_count": 9850, "favorite_count": 530,
     "description": "Centralized virtualization management platform controlling ESXi hypervisors, VM provisioning, and storage pools across all compute clusters."},
    {"name": "Red Hat Ansible Tower", "category": "Infrastructure", "icon": "Cpu", "url": "https://ansible.internal.corp", "environment": "Internal", "status": "Active", "usage_count": 7600, "favorite_count": 480,
     "description": "Automation controller for executing playbook deployments, configuration management, and system patching across the fleet."},
    {"name": "Kubernetes OpenShift", "category": "Infrastructure", "icon": "Box", "url": "https://openshift.internal.corp", "environment": "Production", "status": "Active", "usage_count": 17200, "favorite_count": 1040,
     "description": "Enterprise container orchestration platform managing microservices, ingress routes, and CI/CD pods for all product teams."},
    {"name": "Terraform Enterprise", "category": "Infrastructure", "icon": "FolderGit2", "url": "https://terraform.internal.corp", "environment": "Cloud", "status": "Active", "usage_count": 12100, "favorite_count": 820,
     "description": "Infrastructure as Code collaborative platform managing cloud resource state files, policies, and drift detection."},
    # Network
    {"name": "Palo Alto Panorama", "category": "Network", "icon": "Network", "url": "https://panorama.internal.corp", "environment": "Production", "status": "Active", "usage_count": 5200, "favorite_count": 290,
     "description": "Centralized next-generation firewall management, security policy distribution, and global network routing."},
    {"name": "Cisco DNA Center", "category": "Network", "icon": "Share2", "url": "https://dnac.internal.corp", "environment": "Production", "status": "Active", "usage_count": 3400, "favorite_count": 190,
     "description": "Software-defined networking controller for switch fabrics, wireless access points, and zero-trust access policies."},
    {"name": "F5 BIG-IP LTM", "category": "Network", "icon": "Workflow", "url": "https://f5.internal.corp", "environment": "Production", "status": "Active", "usage_count": 4800, "favorite_count": 210,
     "description": "Local traffic management, SSL offloading, global server load balancing, and application acceleration for public services."},
    {"name": "Infoblox DDI", "category": "Network", "icon": "Globe", "url": "https://infoblox.internal.corp", "environment": "Production", "status": "Active", "usage_count": 5500, "favorite_count": 270,
     "description": "Enterprise core network services managing authoritative DNS zones, DHCP scopes, and IP address management (IPAM)."},
    # Security
    {"name": "CyberArk PAS", "category": "Security", "icon": "ShieldAlert", "url": "https://cyberark.internal.corp", "environment": "Production", "status": "Active", "usage_count": 8940, "favorite_count": 420,
     "description": "Privileged Access Security solution protecting enterprise credentials, session management, and credential vaulting for administrators."},
    {"name": "Tenable Nessus", "category": "Security", "icon": "Lock", "url": "https://tenable.internal.corp", "environment": "Production", "status": "Active", "usage_count": 6300, "favorite_count": 310,
     "description": "Vulnerability scanning, continuous threat exposure assessment, and automated compliance auditing across all assets."},
    {"name": "Splunk Enterprise SIEM", "category": "Security", "icon": "Radio", "url": "https://siem.internal.corp", "environment": "Production", "status": "Active", "usage_count": 18900, "favorite_count": 870,
     "description": "Security information and event management aggregating terabytes of logs for real-time threat intelligence and incident response."},
    {"name": "HashiCorp Vault", "category": "Security", "icon": "KeyRound", "url": "https://vault.internal.corp", "environment": "Production", "status": "Active", "usage_count": 15600, "favorite_count": 890,
     "description": "Dynamic secrets management, TLS certificate authority, encryption-as-a-service, and token brokering for every service."},
    {"name": "CrowdStrike Falcon", "category": "Security", "icon": "Eye", "url": "https://falcon.internal.corp", "environment": "Cloud", "status": "Active", "usage_count": 9300, "favorite_count": 460,
     "description": "Cloud-native endpoint detection and response (EDR) platform preventing malware and unauthorized processes on every laptop and server."},
    {"name": "Okta Verify SSO", "category": "Security", "icon": "ShieldCheck", "url": "https://sso.internal.corp", "environment": "Cloud", "status": "Active", "usage_count": 42000, "favorite_count": 2400,
     "description": "Identity and access management provider with adaptive multi-factor authentication and universal directory. Your single sign-on to everything."},
    # Monitoring
    {"name": "Grafana Enterprise", "category": "Monitoring", "icon": "Activity", "url": "https://grafana.internal.corp", "environment": "Production", "status": "Active", "usage_count": 14200, "favorite_count": 910,
     "description": "Operational observability platform providing unified telemetry dashboards, logs, and real-time alerting pipelines."},
    {"name": "Datadog APM", "category": "Monitoring", "icon": "Gauge", "url": "https://datadog.internal.corp", "environment": "Cloud", "status": "Active", "usage_count": 12800, "favorite_count": 760,
     "description": "Distributed tracing, synthetic monitoring, serverless metrics, and real-time application health metrics."},
    {"name": "Prometheus & Alertmanager", "category": "Monitoring", "icon": "BellRing", "url": "https://prometheus.internal.corp", "environment": "Production", "status": "Active", "usage_count": 13900, "favorite_count": 680,
     "description": "Time-series dimensional metric scraping engine with customizable alerting rules for Kubernetes clusters."},
    {"name": "Dynatrace OneAgent", "category": "Monitoring", "icon": "ChartLine", "url": "https://dynatrace.internal.corp", "environment": "Production", "status": "Active", "usage_count": 6900, "favorite_count": 340,
     "description": "Full-stack AI-assisted application performance monitoring, automated root-cause analysis, and user telemetry."},
    {"name": "Zabbix Infrastructure", "category": "Monitoring", "icon": "Terminal", "url": "https://zabbix.internal.corp", "environment": "Internal", "status": "Deprecated", "usage_count": 1400, "favorite_count": 40,
     "description": "Agent-based network device and hardware sensor monitoring for distributed edge data centers. Scheduled for decommission in favor of Prometheus."},
    # Data Center
    {"name": "Veeam Backup & Replication", "category": "Data Center", "icon": "HardDrive", "url": "https://veeam.internal.corp", "environment": "On-Premises", "status": "Active", "usage_count": 4120, "favorite_count": 280,
     "description": "Enterprise automated backup, disaster recovery, and data protection suite for virtual and physical workloads."},
    {"name": "NetApp ONTAP SAN", "category": "Data Center", "icon": "Database", "url": "https://ontap.internal.corp", "environment": "On-Premises", "status": "Active", "usage_count": 2900, "favorite_count": 140,
     "description": "Enterprise unified hybrid storage management system for NFS/CIFS shares and iSCSI high-availability volumes."},
    {"name": "Nutanix Prism Central", "category": "Data Center", "icon": "Boxes", "url": "https://nutanix.internal.corp", "environment": "On-Premises", "status": "Active", "usage_count": 3100, "favorite_count": 170,
     "description": "Hyperconverged infrastructure management console overseeing distributed storage fabric and compute clusters."},
    {"name": "Pure Storage FlashBlade", "category": "Data Center", "icon": "Zap", "url": "https://purestorage.internal.corp", "environment": "On-Premises", "status": "Maintenance", "usage_count": 2100, "favorite_count": 95,
     "description": "Unified fast-file and object storage management for AI workloads, analytics, and rapid backup restore."},
    # HR
    {"name": "Workday HRIS", "category": "HR", "icon": "Users", "url": "https://workday.internal.corp", "environment": "Cloud", "status": "Active", "usage_count": 31000, "favorite_count": 1820,
     "description": "Human capital management system for the employee directory, benefits enrollment, PTO scheduling, and payroll. Every employee's first stop."},
    {"name": "Greenhouse Recruiting", "category": "HR", "icon": "UserPlus", "url": "https://greenhouse.internal.corp", "environment": "Cloud", "status": "Active", "usage_count": 4700, "favorite_count": 230,
     "description": "Applicant tracking system, candidate pipeline coordinator, and structured interview feedback portal for hiring teams."},
    {"name": "Culture Amp", "category": "HR", "icon": "Heart", "url": "https://cultureamp.internal.corp", "environment": "Cloud", "status": "Active", "usage_count": 3800, "favorite_count": 190,
     "description": "Employee engagement surveys, 360-degree performance evaluations, and employee wellness analytics."},
    {"name": "Lattice Goals & 1:1s", "category": "HR", "icon": "Target", "url": "https://lattice.internal.corp", "environment": "Cloud", "status": "Active", "usage_count": 5800, "favorite_count": 310,
     "description": "People management platform for OKR tracking, continuous feedback loops, and 1-on-1 manager syncs."},
    # Finance
    {"name": "SAP S/4HANA ERP", "category": "Finance", "icon": "DollarSign", "url": "https://erp.internal.corp", "environment": "Production", "status": "Active", "usage_count": 11400, "favorite_count": 640,
     "description": "Central enterprise resource planning system managing ledgers, corporate purchasing, assets, and invoices."},
    {"name": "Coupa Procurement", "category": "Finance", "icon": "CreditCard", "url": "https://coupa.internal.corp", "environment": "Cloud", "status": "Active", "usage_count": 8200, "favorite_count": 390,
     "description": "Business spend management, purchase order approvals, supplier contracts, and corporate expense tracking."},
    {"name": "Expensify Enterprise", "category": "Finance", "icon": "Receipt", "url": "https://expensify.internal.corp", "environment": "Cloud", "status": "Active", "usage_count": 19400, "favorite_count": 1100,
     "description": "Receipt scanning, corporate card reconciliation, employee expense reports, and automated reimbursement."},
    {"name": "Anaplan Modeling", "category": "Finance", "icon": "ChartPie", "url": "https://anaplan.internal.corp", "environment": "Cloud", "status": "Active", "usage_count": 4300, "favorite_count": 220,
     "description": "Connected financial planning, budgeting simulations, headcount capacity modeling, and forecast scenario analytics."},
]


async def seed() -> None:
    from lib.db import db, ensure_indexes

    now = datetime.now(timezone.utc)
    await db.apps.delete_many({})
    docs = []
    for i, spec in enumerate(APPS):
        payload = AppCreate(**spec)
        docs.append(
            {
                **payload.model_dump(),
                "id": str(uuid.uuid4()),
                "usage_count": spec["usage_count"],
                "favorite_count": spec["favorite_count"],
                # stagger history so Recently Added / Recently Updated sorts are meaningful
                "created_at": now - timedelta(days=5 + i * 19),
                "updated_at": now - timedelta(days=1 + (i * 3) % 41),
            }
        )
    await db.apps.insert_many(docs)
    await ensure_indexes()
    print(f"Seeded {len(docs)} enterprise applications.")


if __name__ == "__main__":
    asyncio.run(seed())
