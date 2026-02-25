---
work_item_id: 130704
work_item_type: Bug
state: Ready for production
assigned_to: "Gustavo Grisales"
created: 2026-01-14T23:10:39
changed: 2026-02-18T12:48:31
area_path: Magaya Core Project\Blue Ivory Team
changeset_ids: [63573, 63545]
file_paths: ["$/Magaya Core Project/Projects/MAIN-BRANCHES/BLUE-IVORY-RC/ExpExpl/CustomFieldsPage.cpp", "$/Magaya Core Project/Projects/MAIN-BRANCHES/BLUE-IVORY-RC-HOTFIX/ExpExpl/CustomFieldsPage.cpp"]
---

# Bug #130704: [BI]  The system reverts the Custom Field address back to the default shipping addres

**Estado:** Ready for production | **Asignado:** Gustavo Grisales | **Creado:** 2026-01-14T23:10:39 | **Modificado:** 2026-02-18T12:48:31
**Área:** Magaya Core Project\Blue Ivory Team

## Descripción

(sin descripción)

## Changesets vinculados

### Changeset 63573 — Adrian Moreno — 2026-02-13T23:13:08.577Z

Fixed Bug 130704: [BI] The system reverts the Custom Field address back to the default shipping addres

**Archivos:**
- [edit, merge] `$/Magaya Core Project/Projects/MAIN-BRANCHES/BLUE-IVORY-RC/ExpExpl/CustomFieldsPage.cpp`

**Diff** `CustomFieldsPage.cpp` (62621 → 63573):

```diff
...
  	ref<CEntity> entity;
  
- 	if (ref<CEntityWithAddress> obj = data.m_Object; !obj.is_nil() && data.m_Value)
+ 	const bool has_persisted_value = static_cast<bool>(data.m_Value);
+ 
+ 	if (ref<CEntityWithAddress> obj = data.m_Object; !obj.is_nil() && has_persisted_value)
  	{
  		address = obj->GetAddress();
...
  	auto entity_address_ctrl = std::make_unique<CEntityAddressControl>(supported_entities, unsupported_entities, std::move(pUI));
  	entity_address_ctrl->SetGroupTextId(IDS_VALUE);
+ 
+ 	// NOTE: This binds the address object to the control; if you later call UpdateAddress(), it will override it with the default address.
  	entity_address_ctrl->AddEntry(IDS_VALUE, address, EntityAddressType::Shipping);
  
...
  	entity_address_ctrl->SetEntityTypes(supported_entities);
  	entity_address_ctrl->SelectEntity(entity);
- 	entity_address_ctrl->UpdateAddress();
  
+ 	// Apply the default address only when the field is empty (no persisted value).
+ // If the user previously selected Billing, calling UpdateAddress() will overwrite it back to the default Shipping address.
+ 	if (!has_persisted_value)
+ 	{
+ 		entity_address_ctrl->UpdateAddress();
+ 	}
+ 
  	return entity_address_ctrl;
  }
```

### Changeset 63545 — Gustavo Grisales — 2026-02-13T04:16:03.863Z

Fixed Bug 130704: [BI] The system reverts the Custom Field address back to the default shipping addres

**Archivos:**
- [edit] `$/Magaya Core Project/Projects/MAIN-BRANCHES/BLUE-IVORY-RC-HOTFIX/ExpExpl/CustomFieldsPage.cpp`

**Diff** `CustomFieldsPage.cpp` (62560 → 63545):

```diff
...
  	ref<CEntity> entity;
  
- 	if (ref<CEntityWithAddress> obj = data.m_Object; !obj.is_nil() && data.m_Value)
+ 	const bool has_persisted_value = static_cast<bool>(data.m_Value);
+ 
+ 	if (ref<CEntityWithAddress> obj = data.m_Object; !obj.is_nil() && has_persisted_value)
  	{
  		address = obj->GetAddress();
...
  	auto entity_address_ctrl = std::make_unique<CEntityAddressControl>(supported_entities, unsupported_entities, std::move(pUI));
  	entity_address_ctrl->SetGroupTextId(IDS_VALUE);
+ 
+ 	// NOTE: This binds the address object to the control; if you later call UpdateAddress(), it will override it with the default address.
  	entity_address_ctrl->AddEntry(IDS_VALUE, address, EntityAddressType::Shipping);
  
...
  	entity_address_ctrl->SetEntityTypes(supported_entities);
  	entity_address_ctrl->SelectEntity(entity);
- 	entity_address_ctrl->UpdateAddress();
  
+ 	// Apply the default address only when the field is empty (no persisted value).
+ // If the user previously selected Billing, calling UpdateAddress() will overwrite it back to the default Shipping address.
+ 	if (!has_persisted_value)
+ 	{
+ 		entity_address_ctrl->UpdateAddress();
+ 	}
+ 
  	return entity_address_ctrl;
  }
```

## Resumen de archivos editados

- `$/Magaya Core Project/Projects/MAIN-BRANCHES/BLUE-IVORY-RC/ExpExpl/CustomFieldsPage.cpp`
- `$/Magaya Core Project/Projects/MAIN-BRANCHES/BLUE-IVORY-RC-HOTFIX/ExpExpl/CustomFieldsPage.cpp`