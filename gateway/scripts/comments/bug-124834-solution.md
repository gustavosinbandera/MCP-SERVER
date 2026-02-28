## Solution: Fix client DB – remove WHRs from July 28, 2025

**Bug #124834** (assigned to Gustavo Grisales)

### Summary

The fix implements a one-off cleanup function **`EliminarTodosWHR_28Julio2025()`** that removes all Warehouse Receipts (WHR) created on July 28, 2025 from the client database. This corrects bad or test data that was affecting the client DB.

### Root cause

WHR records from that date needed to be removed from the database (e.g. incorrect or test data).

### Implementation

- The function uses **`ListarWHR_28Julio2025(whrs)`** to get the list of WHRs to delete.
- It obtains the root **`CWHReceiptList`** from the database context.
- For each WHR:
  - It clears the related **`CWHItemList`** (items) via **`RemoveAll()`**.
  - It finds the **`set_member`** for that WHR in the receipt list and removes it from the list.
  - It deletes the **`CWH_Receipt`** entity with **`magl::db::Delete<CWH_Receipt>(whr)`** and increments the deleted count.
- Returns the number of WHRs successfully deleted.

### Code

```cpp
int EliminarTodosWHR_28Julio2025()
{
	std::vector<ref<CWH_Receipt>> whrs;
	int n = ListarWHR_28Julio2025(whrs);
	if (n == 0)
		return 0;

	ref<CWHReceiptList> whr_list = magl::context::GetDatabaseRoot()->GetWhReceiptList();
	if (whr_list.is_nil())
		return 0;

	int deleted = 0;
	for (ref<CWH_Receipt> whr : whrs)
	{
		if (whr.is_nil())
			continue;

		ref<CWHItemList> items = whr->GetItemList();
		if (!items.is_nil())
			modify(items)->RemoveAll();

		ref<set_member> main_mbr;
		for (ref<set_member> mbr = whr_list->first; !mbr.is_nil(); mbr = mbr->next)
		{
			if (mbr->obj == whr)
			{
				main_mbr = mbr;
				break;
			}
		}
		if (main_mbr.is_nil())
			continue;

		modify(whr_list)->remove(main_mbr);
		if (magl::db::Delete<CWH_Receipt>(whr) == ERR_OK)
			++deleted;
	}
	return deleted;
}
```

### Result

- All WHRs from July 28, 2025 are removed from the client DB (items first, then the receipt from the list, then the entity).
- The function returns the count of deleted WHRs; `0` if there were none or the list was nil.
