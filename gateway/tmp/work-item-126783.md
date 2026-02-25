---
work_item_id: 126783
work_item_type: Bug
state: Development Completed
assigned_to: "Gustavo Grisales"
created: 2025-10-23T21:15:53
changed: 2026-02-20T16:05:39
area_path: Magaya Core Project\Blue Ivory Team
changeset_ids: [63599]
file_paths: ["$/Magaya Core Project/Projects/MAIN-BRANCHES/BLUE-IVORY-RC-HOTFIX/Common/AccountItemExDataLayer.cpp"]
---

# Bug #126783: [BI]There is an entity on the vendor list that is a FW agent.

**Estado:** Development Completed | **Asignado:** Gustavo Grisales | **Creado:** 2025-10-23T21:15:53 | **Modificado:** 2026-02-20T16:05:39
**Área:** Magaya Core Project\Blue Ivory Team

## Descripción

(sin descripción)

## Changesets vinculados

### Changeset 63599 — Gustavo Grisales — 2026-02-19T15:52:57.797Z

Fixed Bug 126783: [BI]There is an entity on the vendor list that is a FW agent.

**Archivos:**
- [edit] `$/Magaya Core Project/Projects/MAIN-BRANCHES/BLUE-IVORY-RC-HOTFIX/Common/AccountItemExDataLayer.cpp`

**Diff** `AccountItemExDataLayer.cpp` (62952 → 63599):

```diff
...
  		return ERR_DEFAULT;
  
+ 	// Bill/BillRefund: To must be Vendor (same as SaveAccountingObj2DB). Reject Forwarding Agent etc.
+ 	if (object->IsBill())
+ 	{
+ 		if (!entity->IsVendor())
+ 			return ERR_INVALID_ENTITY;
+ 	}
+ 	else if (object->IsInvoice())
+ 	{
+ 		if (!entity->IsClient())
+ 			return ERR_INVALID_ENTITY;
+ 	}
+ 
  	return ERR_OK;
  }
```

## Resumen de archivos editados

- `$/Magaya Core Project/Projects/MAIN-BRANCHES/BLUE-IVORY-RC-HOTFIX/Common/AccountItemExDataLayer.cpp`