# Diff — Changeset 63599

## Archivo: `$/Magaya Core Project/Projects/MAIN-BRANCHES/BLUE-IVORY-RC-HOTFIX/Common/AccountItemExDataLayer.cpp` (62952 → 63599)
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
