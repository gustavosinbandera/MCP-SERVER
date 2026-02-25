---
work_item_id: 132834
work_item_type: Bug
state: Done
assigned_to: "Osniel Gonzalez"
created: 2026-02-12T21:05:24
changed: 2026-02-18T23:46:25
area_path: Magaya Core Project\Performance and Stability
changeset_ids: [63583, 63552, 63541]
file_paths: ["$/Magaya Core Project/Projects/MAIN-BRANCHES/BLUE-IVORY-MAIN/Common/CustomFieldsController.cpp", "$/Magaya Core Project/Projects/MAIN-BRANCHES/BLUE-IVORY-MAIN/CS/ForwardToWorkflowJsWorker.cpp", "$/Magaya Core Project/Projects/MAIN-BRANCHES/BLUE-IVORY-MAIN/CS/WorkflowJsTransactionDetailsProvider.cpp", "$/Magaya Core Project/Projects/MAIN-BRANCHES/BLUE-IVORY-MAIN/CS/WorkflowJsTransactionDetailsProvider.h", "$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/Common/ColumnSettings.cpp", "$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/Common/control_extra.cpp", "$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/Common/control_extra.h", "$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/Common/CustomFieldsController.cpp", "$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/Common/DataDog.cpp", "$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/Common/DataDog.h", "$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/common/formatNum.cpp", "$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/Common/ResizableWindow.cpp", "$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/Common/RolesSecurityHelper.cpp", "$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/Common/SaveObj2DB.cpp", "$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/Common/SelectFileFormatDlg.cpp", "$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/Common/StrHelper.cpp", "$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/Common/wms/controllers/TaskController.cpp", "$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/CS/ForwardToWorkflowJsWorker.cpp", "$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/CS/WorkflowJsTransactionDetailsProvider.cpp", "$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/CS/WorkflowJsTransactionDetailsProvider.h", "$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/ExpExpl/BrowserDlg.cpp", "$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/ExpExpl/BrowserHeaderControl.cpp", "$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/ExpExpl/DeniedPartyScreeningHandler.cpp", "$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/ExpExpl/ExpExpl.cpp", "$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/ExpExpl/HistoryDlg.cpp", "$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/ExpExpl/ListBrowserMediator.cpp", "$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/ExpExpl/LookupControl.cpp", "$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/Test/Flow.Move.Test/NWMSMoveItems.cpp", "$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/Test/Flow.Receiving.Test/FLOWWMSInformedReceiveItems.cpp", "$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/WH/RecordUIImpl.cpp", "$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/WH/SelItemsPage.cpp", "$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/WH/ShipmentUI.cpp", "$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/WH/WHReceiptSheet.cpp", "$/Magaya Core Project/Projects/MAIN-BRANCHES/BLUE-IVORY-RC/CS/ForwardToWorkflowJsWorker.cpp", "$/Magaya Core Project/Projects/MAIN-BRANCHES/BLUE-IVORY-RC/CS/WorkflowJsTransactionDetailsProvider.cpp", "$/Magaya Core Project/Projects/MAIN-BRANCHES/BLUE-IVORY-RC/CS/WorkflowJsTransactionDetailsProvider.h"]
---

# Bug #132834: [BI] Add Port Code to Workflow Notifications

**Estado:** Done | **Asignado:** Osniel Gonzalez | **Creado:** 2026-02-12T21:05:24 | **Modificado:** 2026-02-18T23:46:25
**Área:** Magaya Core Project\Performance and Stability

## Descripción

(sin descripción)

## Changesets vinculados

### Changeset 63583 — Osniel Gonzalez — 2026-02-16T21:28:25.38Z

- Bug 132834: [BI] Add Port Code to Workflow Notifications
- Bug 132708: [Blue Ivory] Custom fields for credit memos are not sent to magaya workflow db

**Archivos:**
- [edit, merge] `$/Magaya Core Project/Projects/MAIN-BRANCHES/BLUE-IVORY-MAIN/Common/CustomFieldsController.cpp`
- [edit, merge] `$/Magaya Core Project/Projects/MAIN-BRANCHES/BLUE-IVORY-MAIN/CS/ForwardToWorkflowJsWorker.cpp`
- [edit, merge] `$/Magaya Core Project/Projects/MAIN-BRANCHES/BLUE-IVORY-MAIN/CS/WorkflowJsTransactionDetailsProvider.cpp`
- [edit, merge] `$/Magaya Core Project/Projects/MAIN-BRANCHES/BLUE-IVORY-MAIN/CS/WorkflowJsTransactionDetailsProvider.h`

### Changeset 63552 — Adrian Moreno — 2026-02-13T15:29:54.033Z

Bug 132708: [Blue Ivory] Custom fields for credit memos are not sent to magaya workflow db
 Bug 132834: [BI] Add Port Code to Workflow Notifications
 Bug 132419: [BI]CSV part number import is duplicating part number
 Bug 132524: [Blue Ivory] Magaya crashes when creating an SO from a PO (37441)
 Bug 132162: [FWMS] The tasks WR-4MAO and WR-1MAO is blocked in "error" - 00280634 - 31556 - LVO
 Bug 130647: [Blue Ivory]Part numbers are not shown properly in documents
 Bug 132162: [FWMS] The tasks WR-4MAO and WR-1MAO is blocked in "error" - 00280634 - 31556 - LVO
 Task 132209: Fix Bug 131906: Finish button in the shipment creation wizard does not log anything in the logs.
  Bug 132021: [FWMS] The role behavior appears with a backend version of less than 4.9
     Product Backlog Item 132039: Log Cloud Client Version at User Login
 Task 132074: Implement the logging of the Go To and View options from the shipment list
 Bug 130647: [Blue Ivory]Part numbers are not shown properly in documents
 Fixed Bug 130163: [BI-Stability]Need to add more logs on the lookup control

**Archivos:**
- [edit, merge] `$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/Common/ColumnSettings.cpp`
- [edit, merge] `$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/Common/control_extra.cpp`
- [edit, merge] `$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/Common/control_extra.h`
- [edit, merge] `$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/Common/CustomFieldsController.cpp`
- [edit, merge] `$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/Common/DataDog.cpp`
- [edit, merge] `$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/Common/DataDog.h`
- [edit, merge] `$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/common/formatNum.cpp`
- [edit, merge] `$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/Common/ResizableWindow.cpp`
- [edit, merge] `$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/Common/RolesSecurityHelper.cpp`
- [edit, merge] `$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/Common/SaveObj2DB.cpp`
- [edit, merge] `$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/Common/SelectFileFormatDlg.cpp`
- [edit, merge] `$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/Common/StrHelper.cpp`
- [edit, merge] `$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/Common/wms/controllers/TaskController.cpp`
- [edit, merge] `$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/CS/ForwardToWorkflowJsWorker.cpp`
- [edit, merge] `$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/CS/WorkflowJsTransactionDetailsProvider.cpp`
- [edit, merge] `$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/CS/WorkflowJsTransactionDetailsProvider.h`
- [edit, merge] `$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/ExpExpl/BrowserDlg.cpp`
- [edit, merge] `$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/ExpExpl/BrowserHeaderControl.cpp`
- [edit, merge] `$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/ExpExpl/DeniedPartyScreeningHandler.cpp`
- [edit, merge] `$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/ExpExpl/ExpExpl.cpp`
- [edit, merge] `$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/ExpExpl/HistoryDlg.cpp`
- [edit, merge] `$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/ExpExpl/ListBrowserMediator.cpp`
- [edit, merge] `$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/ExpExpl/LookupControl.cpp`
- [edit, merge] `$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/Test/Flow.Move.Test/NWMSMoveItems.cpp`
- [edit, merge] `$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/Test/Flow.Receiving.Test/FLOWWMSInformedReceiveItems.cpp`
- [edit, merge] `$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/WH/RecordUIImpl.cpp`
- [edit, merge] `$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/WH/SelItemsPage.cpp`
- [edit, merge] `$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/WH/ShipmentUI.cpp`
- [edit, merge] `$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/WH/WHReceiptSheet.cpp`

### Changeset 63541 — Osniel Gonzalez — 2026-02-12T22:15:05.267Z

Bug 132834: [BI] Add Port Code to Workflow Notifications

**Archivos:**
- [edit] `$/Magaya Core Project/Projects/MAIN-BRANCHES/BLUE-IVORY-RC/CS/ForwardToWorkflowJsWorker.cpp`
- [edit] `$/Magaya Core Project/Projects/MAIN-BRANCHES/BLUE-IVORY-RC/CS/WorkflowJsTransactionDetailsProvider.cpp`
- [edit] `$/Magaya Core Project/Projects/MAIN-BRANCHES/BLUE-IVORY-RC/CS/WorkflowJsTransactionDetailsProvider.h`

## Resumen de archivos editados

- `$/Magaya Core Project/Projects/MAIN-BRANCHES/BLUE-IVORY-MAIN/Common/CustomFieldsController.cpp`
- `$/Magaya Core Project/Projects/MAIN-BRANCHES/BLUE-IVORY-MAIN/CS/ForwardToWorkflowJsWorker.cpp`
- `$/Magaya Core Project/Projects/MAIN-BRANCHES/BLUE-IVORY-MAIN/CS/WorkflowJsTransactionDetailsProvider.cpp`
- `$/Magaya Core Project/Projects/MAIN-BRANCHES/BLUE-IVORY-MAIN/CS/WorkflowJsTransactionDetailsProvider.h`
- `$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/Common/ColumnSettings.cpp`
- `$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/Common/control_extra.cpp`
- `$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/Common/control_extra.h`
- `$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/Common/CustomFieldsController.cpp`
- `$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/Common/DataDog.cpp`
- `$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/Common/DataDog.h`
- `$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/common/formatNum.cpp`
- `$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/Common/ResizableWindow.cpp`
- `$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/Common/RolesSecurityHelper.cpp`
- `$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/Common/SaveObj2DB.cpp`
- `$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/Common/SelectFileFormatDlg.cpp`
- `$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/Common/StrHelper.cpp`
- `$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/Common/wms/controllers/TaskController.cpp`
- `$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/CS/ForwardToWorkflowJsWorker.cpp`
- `$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/CS/WorkflowJsTransactionDetailsProvider.cpp`
- `$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/CS/WorkflowJsTransactionDetailsProvider.h`
- `$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/ExpExpl/BrowserDlg.cpp`
- `$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/ExpExpl/BrowserHeaderControl.cpp`
- `$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/ExpExpl/DeniedPartyScreeningHandler.cpp`
- `$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/ExpExpl/ExpExpl.cpp`
- `$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/ExpExpl/HistoryDlg.cpp`
- `$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/ExpExpl/ListBrowserMediator.cpp`
- `$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/ExpExpl/LookupControl.cpp`
- `$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/Test/Flow.Move.Test/NWMSMoveItems.cpp`
- `$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/Test/Flow.Receiving.Test/FLOWWMSInformedReceiveItems.cpp`
- `$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/WH/RecordUIImpl.cpp`
- `$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/WH/SelItemsPage.cpp`
- `$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/WH/ShipmentUI.cpp`
- `$/Magaya Core Project/Projects/TEST-BRANCHES/BLUE-IVORY-BETA/WH/WHReceiptSheet.cpp`
- `$/Magaya Core Project/Projects/MAIN-BRANCHES/BLUE-IVORY-RC/CS/ForwardToWorkflowJsWorker.cpp`
- `$/Magaya Core Project/Projects/MAIN-BRANCHES/BLUE-IVORY-RC/CS/WorkflowJsTransactionDetailsProvider.cpp`
- `$/Magaya Core Project/Projects/MAIN-BRANCHES/BLUE-IVORY-RC/CS/WorkflowJsTransactionDetailsProvider.h`