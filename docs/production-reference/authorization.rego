package platform.authorization

import rego.v1


#
# Policy contract
#
# Input:
#
# {
#   "tenant_id": "...",
#
#   "subject": {
#     "authenticated": true,
#     "id": "...",
#     "tenant_id": "...",
#     "permissions": ["orders.read", "orders.cancel"]
#   },
#
#   "action": {
#     "name": "cancel_order",
#     "permission": "orders.cancel",
#     "risk": "HIGH"
#   },
#
#   "resource": {
#     "type": "order",
#     "id": "...",
#     "tenant_id": "..."
#   }
# }
#
#
# Output:
#
# {
#   "allow": false,
#   "requires_approval": true,
#   "reason": "...",
#   "policy_version": "foundation-v1"
# }
#


default decision := {
    "allow": false,
    "requires_approval": false,
    "reason": "default_deny",
    "policy_version": "foundation-v1"
}


tenant_context_valid if {
    input.subject.authenticated == true

    input.tenant_id != ""

    input.subject.tenant_id == input.tenant_id

    input.resource.tenant_id == input.tenant_id
}


permission_granted if {
    some permission in input.subject.permissions

    permission == input.action.permission
}


low_or_medium_risk if {
    input.action.risk in {"LOW", "MEDIUM"}
}


high_or_critical_risk if {
    input.action.risk in {"HIGH", "CRITICAL"}
}


decision := {
    "allow": true,
    "requires_approval": false,
    "reason": "authorized",
    "policy_version": "foundation-v1"
} if {
    tenant_context_valid

    permission_granted

    low_or_medium_risk
}


decision := {
    "allow": false,
    "requires_approval": true,
    "reason": "approval_required",
    "policy_version": "foundation-v1"
} if {
    tenant_context_valid

    permission_granted

    high_or_critical_risk
}
