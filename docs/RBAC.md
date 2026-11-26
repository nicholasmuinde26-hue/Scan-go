# Role‑Based Access Control (RBAC) design for Scan & Go

## 1 Overview
The system follows a **three‑layer hierarchy**:
1. **Platform** – owned by the Super Admin (`PLATFORM_OWNER`).
2. **Supermarket organization** – each supermarket is an `Organization` with its own users, branches, regions, departments.
3. **Operational** – employees work on a specific `Store` (branch), `Region` or `Department`.

The security model is **role + permission + scope**.  A user can hold **multiple role assignments**, each limited to a particular scope (org/store/region/department).

```
permission key =   module.resource.action
example:          staff:manage   (create / update / delete staff)
```

## 2 Data model (Mongo collections)
| Collection | Purpose |
|-----------|---------|
| `roles` | Canonical role names (e.g. `BRANCH_MANAGER`). |
| `permissions` | Individual capabilities (`staff:manage`, `branches:create`). |
| `rolepermissions` | Many‑to‑many mapping between roles and permissions. |
| `userroleassignments` | Links a user to a role plus **scope** fields (`organizationId`, `storeId`, `regionId`, `departmentId`). |
| `organizations`, `stores`, `regions`, `departments` | Existing domain entities. |

> **Scope fields are optional** – a role assignment with only `organizationId` is organization‑wide; adding `storeId` limits it to that branch.

## 3 Permission check flow
```ts
async function hasPermission(user, permissionKey, scope) {
  const perm = await Permission.findOne({key: permissionKey});
  const assignments = await UserRoleAssignment.find({userId: user._id});
  for (const a of assignments) {
    if (await RolePermission.exists({roleId: a.roleId, permissionId: perm._id})
        && matchesScope(a, scope)) {
      return true;
    }
  }
  return false;
}
```
`matchesScope` ensures every non‑null field in the requested `scope` equals the same field on the assignment.

## 4 How to use it in code
* **Express middleware** – `authorize('staff:manage', scopeResolver)` (see `src/middleware/rbac.ts`).
* **Front‑end guard** – call `/api/v1/permissions/check` (a thin wrapper around `hasPermission`) or share the same permission matrix via a generated JSON file.

## 5 Default branch creation
When an `Organization` is created, a **default branch** (`Store`) is automatically inserted if none exists.  The flag `organization.settings.singleBranch` toggles the wizard UI.

## 6 Segregation of duties (SoD)
Roles are independent of permissions; the same user can hold two assignments that together would break SoD, but the **approval workflow engine** (not covered here) enforces that a user cannot approve his own request.

## 7 Super Admin supremacy
All platform‑level roles have `isPlatform: true`.  The middleware never allows a non‑platform role to affect another organization’s data because the scope check will always fail.

---

*Generated on 2026‑11‑25.  Add this file to the repo and reference it from the onboarding docs.*