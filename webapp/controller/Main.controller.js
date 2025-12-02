sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "insptrack/lib/pdfMakeLoader"
], (Controller, JSONModel, Filter, FilterOperator, MessageToast, MessageBox, pdfMakeLoader) => {
    "use strict";

    return Controller.extend("insptrack.controller.Main", {

        onInit() {
            this._wizard = this.byId("ContainerInspectionWizard");
            this._oNavContainer = this.byId("inspectionWizardNavContainer");
            this._initializeModel();
            this._loadCarrierLines();
            this._loadCarrierTypes();
            this._loadInspectionCodes();
            this._wizard.attachStepActivate(this.onWizardStepActivate, this);
        },

        _initializeModel() {
            this.oModel = new JSONModel({
                document: "",
                sequenceNumber: "",
                carrierNumber: "",
                carrierLine: "",
                carrierType: "",
                showAcceptRejectButtons: false,
                showCarrierLineCombo: true,
                imageStepTitle: "Take Photos",
                imageStepMessage: "Take photos of the container.",
                imageStepType: "Information",
                totalImages: 0,
                skipStep2: false,
                currentImageType: "B",
                beforeImageCount: 0,
                afterImageCount: 0,
                beforeImages: [],
                afterImages: [],
                cameraActive: true,
                imageCapured: false,
                cameraStatusText: "Position camera and tap the red button to capture",
                defectCodes: {},
                inspectionCodes: [],
                recordExists: false,
                nextStep: "InspectionCodesStep",
                existingInspectionDate: null,
                hasBeforeImg: false,
                hasAfterImg: false,
                imageType: "B",
                showInspectionCodesStep: true,
                isAccepted: false,
                isRejected: false,
                recordStatus: "",
                isRejectEnabled: true,
                savedCodes: [],
                isAcceptButtonEnabled: true,
                areCheckboxesEnabled: true,
                showCarrierTypeCombo: true
            });
            this.getView().setModel(this.oModel);
            var oViewModel = new JSONModel({ hasPreview: false });
            this.getView().setModel(oViewModel, "viewModel");
        },

        // ========================================
        // HELPER METHODS - COMMON OPERATIONS
        // ========================================

        _createHeaderFilters() {
            return [
                new Filter("Document", FilterOperator.EQ, this.oModel.getProperty("/document")),
                new Filter("Sequencenumber", FilterOperator.EQ, this.oModel.getProperty("/sequenceNumber")),
                new Filter("CarrierNumber", FilterOperator.EQ, this.oModel.getProperty("/carrierNumber"))
            ];
        },

        _getTextToCodeMap() {
            const aInspectionCodesLeft = this.oModel.getProperty("/inspectionCodesLeft") || [];
            const aInspectionCodesRight = this.oModel.getProperty("/inspectionCodesRight") || [];
            const aAllInspectionCodes = [...aInspectionCodesLeft, ...aInspectionCodesRight];

            const textToCodeMap = {};
            aAllInspectionCodes.forEach(item => {
                textToCodeMap[item.text] = item.code;
            });
            return textToCodeMap;
        },

        _getCarrierTypeDescription(sCarrierTypeCode) {
            const aCarrierTypes = this.oModel.getProperty("/CarrierTypes") || [];
            console.log("Getting carrier type description for code:", sCarrierTypeCode);
            console.log("Available carrier types:", aCarrierTypes);

            // Match against CarrierTypeCode field
            const oCarrierType = aCarrierTypes.find(item => item.CarrierTypeCode === sCarrierTypeCode);

            if (oCarrierType) {
                // Get description from CarrierTypeCodeText field
                const description = oCarrierType.CarrierTypeCodeText;
                console.log("Found carrier type description:", description);
                return description || sCarrierTypeCode;
            }

            console.log("Carrier type not found, returning code:", sCarrierTypeCode);
            return sCarrierTypeCode;
        },

        _getCarrierLineDescription(sCarrierLineCode) {
            const aCarrierLines = this.oModel.getProperty("/CarrierLines") || [];
            console.log("Getting carrier line description for code:", sCarrierLineCode);
            console.log("Available carrier lines:", aCarrierLines);

            // Match against CarrierLineCode field
            const oCarrierLine = aCarrierLines.find(item => item.CarrierLineCode === sCarrierLineCode);

            if (oCarrierLine) {
                // Get description from CarrierLineCodeText field
                const description = oCarrierLine.CarrierLineCodeText;
                console.log("Found carrier line description:", description);
                return description || sCarrierLineCode;
            }

            console.log("Carrier line not found, returning code:", sCarrierLineCode);
            return sCarrierLineCode;
        },

        _buildSelectedCodes(oDefectCodes) {
            const textToCodeMap = this._getTextToCodeMap();
            const oCurrentDate = new Date();
            const aSelectedCodes = [];
            let iSeq = 1;

            Object.keys(oDefectCodes).forEach(sKey => {
                if (oDefectCodes[sKey]) {
                    const sCodeValue = textToCodeMap[sKey];
                    if (!sCodeValue) {
                        console.error("Could not find code for text:", sKey);
                        return;
                    }
                    aSelectedCodes.push({
                        Document: this.oModel.getProperty("/document"),
                        Sequencenumber: this.oModel.getProperty("/sequenceNumber"),
                        CarrierNumber: this.oModel.getProperty("/carrierNumber"),
                        InspectionDate: `/Date(${oCurrentDate.getTime()})/`,
                        CodeSeq: iSeq.toString().padStart(2, '0'),
                        CodeValue: sCodeValue,
                        CodeText: sKey,
                        CreatedOn: `/Date(${oCurrentDate.getTime()})/`,
                        CreatedBy: "USER"
                    });
                    iSeq++;
                }
            });

            return aSelectedCodes;
        },

        _createDeepEntityPayload(aSelectedCodes, sStatus) {
            const oCurrentDate = new Date();
            return {
                Document: this.oModel.getProperty("/document"),
                Sequencenumber: this.oModel.getProperty("/sequenceNumber"),
                CarrierNumber: this.oModel.getProperty("/carrierNumber"),
                CarrierLineCode: this.oModel.getProperty("/carrierLine"),
                CarrierTyCode: this.oModel.getProperty("/carrierType"),
                InspectionDate: `/Date(${oCurrentDate.getTime()})/`,
                Status: sStatus,
                HasBeforeImg: false,
                HasAfterImg: false,
                CreatedBy: "USER",
                CreatedOn: `/Date(${oCurrentDate.getTime()})/`,
                ChangedBy: "USER",
                ChangedOn: `/Date(${oCurrentDate.getTime()})/`,
                np_on_Codes: aSelectedCodes
            };
        },

        _parseErrorMessage(oError) {
            let sErrorMessage = "Operation failed";
            if (oError.responseText) {
                try {
                    const oErrorResponse = JSON.parse(oError.responseText);
                    if (oErrorResponse.error && oErrorResponse.error.message) {
                        sErrorMessage = oErrorResponse.error.message.value || oErrorResponse.error.message;
                    }
                } catch (e) {
                    sErrorMessage = oError.responseText;
                }
            }
            return sErrorMessage;
        },

        async _loadPdfMake() {
            try {
                await pdfMakeLoader.load();
                console.log("pdfMake loaded successfully via UI5 module");
            } catch (error) {
                console.error("Failed to load pdfMake:", error);
                throw new Error("Failed to load PDF library: " + error.message);
            }
        },

        _cleanupCamera() {
            if (this._stream) {
                this._stream.getTracks().forEach(track => track.stop());
                this._stream = null;
            }

            if (this._videoElement) {
                if (this._videoElement.srcObject) {
                    this._videoElement.srcObject = null;
                }
                if (this._videoElement.parentNode) {
                    this._videoElement.parentNode.removeChild(this._videoElement);
                }
                this._videoElement = null;
            }

            var oContainer = sap.ui.getCore().byId("cameraVideoContainer");
            if (oContainer && oContainer.getDomRef()) {
                oContainer.getDomRef().innerHTML = "";
            }
        },

        _clearInputFields() {
            this.byId("documentInput").setValue("");
            this.byId("sequenceInput").setValue("");
            this.byId("carrierInput").setValue("");
            this.byId("carrierLineCombo").setValue("");
            this.byId("carrierTypeCombo").setValue("");

            this.oModel.setProperty("/document", "");
            this.oModel.setProperty("/sequenceNumber", "");
            this.oModel.setProperty("/carrierNumber", "");
            this.oModel.setProperty("/carrierLine", "");
            this.oModel.setProperty("/carrierType", "");
        },

        _resetFlags() {
            this.oModel.setProperty("/recordExists", false);
            this.oModel.setProperty("/hasBeforeImg", false);
            this.oModel.setProperty("/hasAfterImg", false);
            this.oModel.setProperty("/showCarrierLineCombo", true);
            this.oModel.setProperty("/showCarrierTypeCombo", true);
            this.oModel.setProperty("/isRejected", false);
            this.oModel.setProperty("/recordStatus", "");
        },

        _validateStep1() {
            const sDocument = this.oModel.getProperty("/document");
            const sSequence = this.oModel.getProperty("/sequenceNumber");
            const sCarrier = this.oModel.getProperty("/carrierNumber");
            const sCarrierLine = this.oModel.getProperty("/carrierLine");
            const sCarrierType = this.oModel.getProperty("/carrierType");
            const showCarrierLineCombo = this.oModel.getProperty("/showCarrierLineCombo");
            const showCarrierTypeCombo = this.oModel.getProperty("/showCarrierTypeCombo");

            const oStep1 = this.byId("DocumentDetailsStep");

            // Check if all required fields are filled (trim to handle spaces)
            const bAllRequiredFieldsFilled = (sDocument && sDocument.trim().length > 0) &&
                (sSequence && sSequence.trim().length > 0) &&
                (sCarrier && sCarrier.trim().length > 0) &&
                (showCarrierLineCombo ? (sCarrierLine && sCarrierLine.trim().length > 0) : true) &&
                (showCarrierTypeCombo ? (sCarrierType && sCarrierType.trim().length > 0) : true);

            if (bAllRequiredFieldsFilled) {
                if (!oStep1.getValidated()) {
                    oStep1.setValidated(true);
                    console.log("Step 1 validated - all required fields filled");
                }
            } else {
                if (oStep1.getValidated()) {
                    oStep1.setValidated(false);
                    console.log("Step 1 invalidated - required fields missing");
                }
            }
        },

        // ========================================
        // DATA LOADING
        // ========================================

        _loadCarrierLines() {
            const oDataModel = this.getOwnerComponent().getModel();
            console.log("Loading Carrier Lines...");

            oDataModel.read("/VH_CarrierlineSet", {
                success: (oData) => {
                    console.log("Carrier lines Loaded Successfully:", oData.results);
                    this.oModel.setProperty("/CarrierLines", oData.results);
                },
                error: (oError) => {
                    console.error("Error loading carrier lines:", oError);
                    MessageBox.error(this._parseErrorMessage(oError) || "Failed to load carrier lines");
                }
            });
        },

        _loadCarrierTypes() {
            const oDataModel = this.getOwnerComponent().getModel();
            console.log("Loading Carrier Types...");

            oDataModel.read("/VH_CarrierTypeSet", {
                success: (oData) => {
                    console.log("Carrier types Loaded Successfully:", oData.results);
                    this.oModel.setProperty("/CarrierTypes", oData.results);
                },
                error: (oError) => {
                    console.error("Error loading carrier types:", oError);
                    MessageBox.error(this._parseErrorMessage(oError) || "Failed to load carrier types");
                }
            });
        },

        _loadInspectionCodes() {
            const oDataModel = this.getOwnerComponent().getModel();
            console.log("=== LOADING INSPECTION CODES ===");

            oDataModel.read("/InspectCodesSet", {
                success: (oData) => {
                    console.log("SUCCESS - Inspection codes loaded");

                    if (!oData.results || oData.results.length === 0) {
                        console.error("Backend returned empty results!");
                        MessageBox.warning("No inspection codes found in backend table");
                        return;
                    }

                    const oDefectCodes = {};
                    const aInspectionCodes = [];

                    oData.results.forEach((item) => {
                        const sKey = item.InspectionCodeText;
                        oDefectCodes[sKey] = false;
                        aInspectionCodes.push({
                            key: sKey,
                            code: item.InspectionCode,
                            text: item.InspectionCodeText
                        });
                    });

                    const half = Math.ceil(aInspectionCodes.length / 2);
                    const aInspectionCodesLeft = aInspectionCodes.slice(0, half);
                    const aInspectionCodesRight = aInspectionCodes.slice(half);

                    this.oModel.setProperty("/defectCodes", oDefectCodes);
                    this.oModel.setProperty("/inspectionCodesLeft", aInspectionCodesLeft);
                    this.oModel.setProperty("/inspectionCodesRight", aInspectionCodesRight);
                },
                error: (oError) => {
                    console.error("Error loading inspection codes:", oError);
                    MessageBox.error(this._parseErrorMessage(oError) || "Failed to load inspection codes");
                }
            });
        },

        // ========================================
        // STEP 1: DOCUMENT DETAILS
        // ========================================

        onDocumentDetailsChange(oEvent) {
            const sDocument = this.byId("documentInput").getValue();
            const sSequence = this.byId("sequenceInput").getValue();
            const sCarrier = this.byId("carrierInput").getValue();

            let sCarrierLineCode = this.oModel.getProperty("/carrierLine");
            let sCarrierTypeCode = this.oModel.getProperty("/carrierType");
            let bCarrierLineChanged = false;
            let bCarrierTypeChanged = false;

            if (oEvent && oEvent.getSource && oEvent.getSource().getSelectedKey) {
                const oComboBox = oEvent.getSource();
                const sSelectedKey = oComboBox.getSelectedKey();
                const sComboId = oComboBox.getId();

                if (sComboId.includes("carrierLineCombo")) {
                    this.oModel.setProperty("/carrierLine", sSelectedKey);
                    sCarrierLineCode = sSelectedKey;
                    bCarrierLineChanged = true;
                } else if (sComboId.includes("carrierTypeCombo")) {
                    this.oModel.setProperty("/carrierType", sSelectedKey);
                    sCarrierTypeCode = sSelectedKey;
                    bCarrierTypeChanged = true;
                }
            }

            console.log("Validation check:", {
                document: sDocument,
                sequence: sSequence,
                carrier: sCarrier,
                carrierLine: sCarrierLineCode,
                carrierType: sCarrierTypeCode
            });

            const oStep1 = this.byId("DocumentDetailsStep");

            // Check if first 3 fields are filled to trigger record existence check
            const bFirst3FieldsFilled = (sDocument && sDocument.length > 0) &&
                (sSequence && sSequence.length > 0) &&
                (sCarrier && sCarrier.length > 0);

            if (bFirst3FieldsFilled) {
                this.oModel.setProperty("/document", sDocument);
                this.oModel.setProperty("/sequenceNumber", sSequence);
                this.oModel.setProperty("/carrierNumber", sCarrier);

                // Call record check to determine if record exists and if carrier line/type combos should be hidden
                this._checkRecordExists(sDocument, sSequence, sCarrier);
            } else {
                oStep1.setValidated(false);
                console.log("Step 1 invalidated - first 3 fields not complete");
                this._resetFlags();
                this.oModel.setProperty("/showInspectionCodesStep", true);
            }

            // If carrier line or carrier type changed (and first 3 fields already filled), validate step
            if ((bCarrierLineChanged || bCarrierTypeChanged) && bFirst3FieldsFilled) {
                this._validateStep1();
            }
        },

        _checkRecordExists(sDocument, sSequence, sCarrier) {
            console.log("Checking record existence for:", sDocument, sSequence, sCarrier);

            const aFilters = [
                new Filter("Document", FilterOperator.EQ, sDocument),
                new Filter("Sequencenumber", FilterOperator.EQ, sSequence),
                new Filter("CarrierNumber", FilterOperator.EQ, sCarrier)
            ];

            const oModel = this.getOwnerComponent().getModel();

            oModel.read("/InspectionHeaderSet", {
                filters: aFilters,
                success: (oData) => {
                    console.log("Record check response:", oData);

                    if (oData.results && oData.results.length > 0) {
                        const oRecord = oData.results[0];
                        this._handleExistingRecord(oRecord);
                    } else {
                        this._handleNewRecord();
                    }

                    // Validate step only if all required fields are filled
                    this._validateStep1();
                },
                error: (oError) => {
                    console.error("Error checking record existence:", oError);
                    const sErrorMsg = this._parseErrorMessage(oError) || "Validation failed. Please check your inputs.";

                    MessageBox.error(sErrorMsg, {
                        title: "Validation Error",
                        actions: [MessageBox.Action.OK],
                        onClose: () => {
                            this._clearInputFields();
                            this._resetFlags();
                            this.byId("documentInput").focus();
                        }
                    });

                    const oStep1 = this.byId("DocumentDetailsStep");
                    if (oStep1.getValidated()) {
                        oStep1.setValidated(false);
                        console.log("Step 1 invalidated due to validation error");
                    }
                    this._resetFlags();
                }
            });
        },

        _handleExistingRecord(oRecord) {
            console.log("Existing record found:", oRecord);

            this.oModel.setProperty("/recordExists", true);
            this.oModel.setProperty("/existingInspectionDate", oRecord.InspectionDate);
            this.oModel.setProperty("/hasBeforeImg", oRecord.HasBeforeImg);
            this.oModel.setProperty("/hasAfterImg", oRecord.HasAfterImg);
            this.oModel.setProperty("/recordStatus", oRecord.Status);
            this.oModel.setProperty("/carrierLine", oRecord.CarrierLineCode);
            this.oModel.setProperty("/carrierType", oRecord.CarrierTyCode);

            const hasBeforeImg = oRecord.HasBeforeImg === true || oRecord.HasBeforeImg === 'X' || oRecord.HasBeforeImg === 'x';
            const hasAfterImg = oRecord.HasAfterImg === true || oRecord.HasAfterImg === 'X' || oRecord.HasAfterImg === 'x';
            const isRejected = oRecord.Status === 'R';

            // Set rejected flag if status is 'R'
            if (isRejected) {
                this.oModel.setProperty("/isRejected", true);
                console.log("Record status is 'R' - carrier was rejected");
            }

            // Hide carrier line and carrier type combo boxes for existing records with HasBeforeImg (accepted or rejected)
            if (hasBeforeImg) {
                this.oModel.setProperty("/showCarrierLineCombo", false);
                this.oModel.setProperty("/showCarrierTypeCombo", false);
                if (isRejected) {
                    console.log("Carrier line and carrier type combo boxes hidden - rejected record with HasBeforeImg");
                } else {
                    console.log("Carrier line and carrier type combo boxes hidden - existing record with HasBeforeImg");
                }
            }

            // Check if this is a rejected record with before images
            if (isRejected && hasBeforeImg) {
                console.log("Rejected record already has before images - no further action allowed");
                MessageBox.warning("This carrier was rejected so no Images can be taken further", {
                    title: "Rejected Carrier - Complete",
                    onClose: () => {
                        this._clearInputFields();
                        this._resetFlags();
                        const oStep1 = this.byId("DocumentDetailsStep");
                        if (oStep1) {
                            oStep1.setValidated(false);
                        }
                        this.byId("documentInput").focus();
                    }
                });
                return;
            }

            // Check if BOTH before and after images already exist
            if (hasBeforeImg && hasAfterImg) {
                console.log("Record already has both before and after images");
                MessageBox.warning("This record already has both Before and After loading images. No further images can be added.", {
                    title: "Images Already Completed",
                    onClose: () => {
                        this._clearInputFields();
                        this._resetFlags();
                        const oStep1 = this.byId("DocumentDetailsStep");
                        if (oStep1) {
                            oStep1.setValidated(false);
                        }
                        this.byId("documentInput").focus();
                    }
                });
                return;
            }

            if (hasBeforeImg) {
                // Only allow after images if not rejected
                if (!isRejected) {
                    this.oModel.setProperty("/imageStepTitle", "Take Photos");
                    this.oModel.setProperty("/imageStepMessage", "Take photos of the carrier Before/After loading.");
                    this.oModel.setProperty("/imageType", "A");
                    MessageToast.show("Record exists with before images. Ready for after-loading photos.");
                }
            } else {
                this.oModel.setProperty("/imageStepTitle", "Take Photos");
                this.oModel.setProperty("/imageType", "B");
                if (isRejected) {
                    MessageToast.show("Rejected record exists. Ready for before-loading photos only.");
                } else {
                    MessageToast.show("Record exists. Ready for before-loading photos.");
                }
            }
        },

        _handleNewRecord() {
            console.log("New record - proceed with full inspection");

            this._resetFlags();
            this.oModel.setProperty("/imageStepTitle", "Take Photos");
            this.oModel.setProperty("/imageStepMessage", "Take photos of the carrier Before/After loading.");
            this.oModel.setProperty("/imageType", "B");
            this.oModel.setProperty("/showCarrierLineCombo", true);
            this.oModel.setProperty("/showCarrierTypeCombo", true);
            MessageToast.show("New inspection record. Proceed with Inspection codes.");
        },

        onDocumentDetailsComplete: function () {
            console.log("=== onDocumentDetailsComplete FIRED ===");

            const recordExists = this.oModel.getProperty("/recordExists");
            const docStep = this.byId("DocumentDetailsStep");
            const inspStep = this.byId("InspectionCodesStep");
            const imgStep = this.byId("ImageUploadStep");

            if (recordExists) {
                console.log("BRANCHING: Setting next step to ImageUploadStep");
                docStep.setNextStep(imgStep);
            } else {
                console.log("NORMAL FLOW: Setting next step to InspectionCodesStep");
                docStep.setNextStep(inspStep);
            }
        },

        // ========================================
        // STEP 2: INSPECTION CODES
        // ========================================

        onDefectCodeChange(oEvent) {
            const oCheckBox = oEvent.getSource();
            const bSelected = oCheckBox.getSelected();
            const sKey = oCheckBox.data("codeKey");

            // Check if checkboxes are locked (codes already accepted)
            const areCheckboxesEnabled = this.oModel.getProperty("/areCheckboxesEnabled");
            if (!areCheckboxesEnabled) {
                // Revert the checkbox to its previous state
                oCheckBox.setSelected(!bSelected);
                MessageBox.warning("Codes have been accepted and cannot be modified.");
                return;
            }

            console.log(`Checkbox changed: ${sKey} = ${bSelected}`);

            const oDefectCodes = this.oModel.getProperty("/defectCodes");
            oDefectCodes[sKey] = bSelected;
            this.oModel.setProperty("/defectCodes", oDefectCodes);

            let bAnySelected = Object.values(oDefectCodes).some(val => val === true);
            this.oModel.setProperty("/showAcceptRejectButtons", bAnySelected);

            console.log("Any selected:", bAnySelected);
        },

        onAcceptCodes() {
            // Check if codes are already saved
            const oDefectCodes = this.oModel.getProperty("/defectCodes");
            const aCurrentSelectedCodes = Object.keys(oDefectCodes).filter(key => oDefectCodes[key]);
            const aSavedCodes = this.oModel.getProperty("/savedCodes") || [];

            // Sort arrays for comparison
            const currentSorted = aCurrentSelectedCodes.sort().join(",");
            const savedSorted = aSavedCodes.sort().join(",");

            if (aSavedCodes.length > 0 && currentSorted === savedSorted) {
                MessageBox.information("CODES ALREADY SAVED");
                return;
            }

            this._saveInspectionCodes('A', (success) => {
                if (success) {
                    this._wizard.validateStep(this.byId("InspectionCodesStep"));
                    this.oModel.setProperty("/isAccepted", true);
                    this.oModel.setProperty("/isRejectEnabled", false);
                    // Store the saved codes
                    this.oModel.setProperty("/savedCodes", aCurrentSelectedCodes);
                    // Disable Accept button and checkboxes after accepting
                    this.oModel.setProperty("/isAcceptButtonEnabled", false);
                    this.oModel.setProperty("/areCheckboxesEnabled", false);
                    MessageToast.show("Inspection Code saved successfully! Click Step 3 to upload photos.");
                }
            });
        },

        onRejectCodes() {
            // Get current selected codes before saving
            const oDefectCodes = this.oModel.getProperty("/defectCodes");
            const aCurrentSelectedCodes = Object.keys(oDefectCodes).filter(key => oDefectCodes[key]);

            this._saveInspectionCodes('R', (success) => {
                if (success) {
                    // Mark carrier as rejected and navigate to photo capture
                    this.oModel.setProperty("/isRejected", true);
                    this.oModel.setProperty("/imageType", "B");

                    // Store the saved codes (so step 2 re-validates when returning)
                    this.oModel.setProperty("/savedCodes", aCurrentSelectedCodes);
                    this.oModel.setProperty("/isAccepted", true); // Set to true so validation logic works

                    // Disable Accept and Reject buttons after rejecting
                    this.oModel.setProperty("/isAcceptButtonEnabled", false);
                    this.oModel.setProperty("/isRejectEnabled", false);
                    this.oModel.setProperty("/areCheckboxesEnabled", false);

                    // Validate Step 2 so we can proceed to Step 3
                    this._wizard.validateStep(this.byId("InspectionCodesStep"));

                    // Show toast message - user will manually click Step 3 to proceed
                    MessageToast.show("Defect codes rejected and saved. Click Step 3 to take before-loading photos only.");
                }
            });
        },

        onBackToStep1() {
            // Navigate to Step 1 without invalidating Step 2
            // This allows users to go back and then return to Step 2
            // If codes were already accepted, Step 3 will still be accessible

            const that = this;

            // Navigate back first
            this._wizard.previousStep();

            // Then reset progress bar AFTER navigation with a small delay
            setTimeout(function() {
                const oStep1 = that.byId("DocumentDetailsStep");
                const inspStep = that.byId("InspectionCodesStep");
                const imgStep = that.byId("ImageUploadStep");

                if (oStep1 && inspStep && imgStep) {
                    try {
                        // Reset nextStep to default
                        oStep1.setNextStep(inspStep);

                        // Also set subsequentSteps to ensure progress bar shows all 3 steps
                        if (typeof oStep1.setSubsequentSteps === 'function') {
                            oStep1.setSubsequentSteps([inspStep, imgStep]);
                        }

                        console.log("Progress bar reset after going back to Step 1");
                    } catch (e) {
                        console.error("Error resetting progress bar:", e);
                    }
                }
            }, 100);
        },

        _saveInspectionCodes(sStatus, callback) {
            console.log(`=== SAVING CODES (Status: ${sStatus}) ===`);

            const oDefectCodes = this.oModel.getProperty("/defectCodes");
            const aSelectedCodes = this._buildSelectedCodes(oDefectCodes);

            if (aSelectedCodes.length === 0) {
                if (sStatus === 'R') {
                    MessageBox.warning("No defect codes selected to reject.", {
                        onClose: () => {
                            this._wizard.previousStep();
                        }
                    });
                } else {
                    MessageBox.error("Please select at least one defect code to proceed.");
                }
                if (callback) callback(false);
                return;
            }

            const oDeepEntityData = this._createDeepEntityPayload(aSelectedCodes, sStatus);

            console.log("Deep Entity Data Structure:");
            console.log(JSON.stringify(oDeepEntityData, null, 2));

            const oModel = this.getOwnerComponent().getModel();

            oModel.create("/InspectionHeaderSet", oDeepEntityData, {
                success: (oData) => {
                    console.log("SUCCESS: CREATE_DEEP_ENTITY called!");
                    console.log("Response data:", oData);
                    if (callback) callback(true);
                },
                error: (oError) => {
                    console.error("ERROR: CREATE_DEEP_ENTITY failed");
                    console.error("Error object:", oError);
                    const sErrorMessage = this._parseErrorMessage(oError) || "Failed to save codes";
                    MessageBox.error("Save Failed:\n" + sErrorMessage);
                    if (callback) callback(false);
                }
            });
        },

        // ========================================
        // STEP 3: IMAGE UPLOAD
        // ========================================

        onOpenCameraDialog() {
            var that = this;

            if (!this._cameraDialog) {
                this._cameraDialog = new sap.m.Dialog({
                    title: "Camera Preview",
                    contentWidth: "600px",
                    contentHeight: "420px",
                    content: new sap.m.VBox({
                        items: [
                            new sap.m.VBox({
                                id: "cameraVideoContainer",
                                width: "100%",
                                height: "400px"
                            })
                        ]
                    }),
                    beginButton: new sap.m.Button({
                        text: "Capture",
                        type: "Emphasized",
                        press: function () { that.onCapture(); }
                    }),
                    endButton: new sap.m.Button({
                        text: "Cancel",
                        press: function () {
                            that.onCloseCameraDialog();
                        }
                    }),
                    afterClose: function () {
                        that._cleanupCamera();
                    }
                });
                this.getView().addDependent(this._cameraDialog);
            }

            this._cameraDialog.open();

            setTimeout(function () {
                var oContainer = sap.ui.getCore().byId("cameraVideoContainer");
                if (oContainer && oContainer.getDomRef()) {
                    var containerDom = oContainer.getDomRef();
                    containerDom.innerHTML = "";

                    var video = document.createElement("video");
                    video.id = "cameraVideo";
                    video.setAttribute("autoplay", true);
                    video.style.width = "100%";
                    video.style.height = "100%";
                    video.style.objectFit = "cover";
                    video.style.position = "relative";
                    containerDom.appendChild(video);

                    navigator.mediaDevices.getUserMedia({
                        video: {
                            facingMode: "environment",
                            width: { ideal: 1280 },
                            height: { ideal: 720 }
                        }
                    })
                        .then(function (stream) {
                            that._stream = stream;
                            video.srcObject = stream;
                            that._videoElement = video;
                        })
                        .catch(function (err) {
                            MessageToast.show("Cannot access camera: " + err);
                        });
                }
            }, 300);
        },

        onCapture() {
            console.log("=== CAPTURE BUTTON CLICKED ===");

            var video = this._videoElement;
            if (!video) {
                MessageToast.show("Video not ready!");
                return;
            }

            var canvas = document.createElement("canvas");
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            canvas.getContext("2d").drawImage(video, 0, 0);

            var dataURL = canvas.toDataURL("image/jpeg", 0.8);
            const imageType = this.oModel.getProperty("/currentImageType");

            const oImageData = {
                id: Date.now().toString(),
                base64: dataURL,
                timestamp: new Date().toISOString(),
                type: imageType
            };

            if (imageType === "B") {
                const aBeforeImages = this.oModel.getProperty("/beforeImages") || [];
                aBeforeImages.push(oImageData);
                this.oModel.setProperty("/beforeImages", aBeforeImages);
                this.oModel.setProperty("/beforeImageCount", aBeforeImages.length);
                MessageToast.show(`Before loading image ${aBeforeImages.length} captured`);
            } else {
                const aAfterImages = this.oModel.getProperty("/afterImages") || [];
                aAfterImages.push(oImageData);
                this.oModel.setProperty("/afterImages", aAfterImages);
                this.oModel.setProperty("/afterImageCount", aAfterImages.length);
                MessageToast.show(`After loading image ${aAfterImages.length} captured`);
            }

            const oStep3 = this.byId("ImageUploadStep");
            if (oStep3) {
                oStep3.setValidated(true);
                console.log("Step 3 validated - Complete Inspection button should appear");
            }

            this._cameraDialog.close();
            console.log("Image saved directly to gallery");
        },

        onCloseCameraDialog() {
            if (this._cameraDialog) {
                this._cameraDialog.close();
            }
            this._cleanupCamera();
            this.oModel.setProperty("/cameraActive", true);
            this.oModel.setProperty("/imageCapured", false);
        },

        onTakeBeforePhoto() {
            const count = this.oModel.getProperty("/beforeImageCount");
            if (count >= 6) {
                MessageBox.warning("Maximum 6 before-loading images allowed. You have already taken " + count + " images.");
                return;
            }
            this.oModel.setProperty("/currentImageType", "B");
            this.onOpenCameraDialog();
        },

        onTakeAfterPhoto() {
            // Check if carrier was rejected
            const isRejected = this.oModel.getProperty("/isRejected");
            const recordStatus = this.oModel.getProperty("/recordStatus");

            if (isRejected || recordStatus === 'R') {
                MessageBox.warning("This carrier was rejected. Only before-loading photos are allowed for rejected carriers.");
                return;
            }

            const count = this.oModel.getProperty("/afterImageCount");
            if (count >= 6) {
                MessageBox.warning("Maximum 6 after-loading images allowed. You have already taken " + count + " images.");
                return;
            }
            this.oModel.setProperty("/currentImageType", "A");
            this.onOpenCameraDialog();
        },

        onDeleteBeforeImage(oEvent) {
            const oListItem = oEvent.getParameter("listItem");
            const oContext = oListItem.getBindingContext();
            const sPath = oContext.getPath();
            const iIndex = parseInt(sPath.split("/").pop());

            const aBeforeImages = this.oModel.getProperty("/beforeImages");
            aBeforeImages.splice(iIndex, 1);

            this.oModel.setProperty("/beforeImages", aBeforeImages);
            this.oModel.setProperty("/beforeImageCount", aBeforeImages.length);

            MessageToast.show("Before image deleted");
        },

        onDeleteAfterImage(oEvent) {
            const oListItem = oEvent.getParameter("listItem");
            const oContext = oListItem.getBindingContext();
            const sPath = oContext.getPath();
            const iIndex = parseInt(sPath.split("/").pop());

            const aAfterImages = this.oModel.getProperty("/afterImages");
            aAfterImages.splice(iIndex, 1);

            this.oModel.setProperty("/afterImages", aAfterImages);
            this.oModel.setProperty("/afterImageCount", aAfterImages.length);

            MessageToast.show("After image deleted");
        },

        // ========================================
        // PDF GENERATION & UPLOAD
        // ========================================

        onSaveAllImagesToPDF: async function () {
            console.log("=== SAVE TO ATTACHMENTS CLICKED ===");

            const beforeCount = this.oModel.getProperty("/beforeImageCount");
            const afterCount = this.oModel.getProperty("/afterImageCount");

            let imageType = "";
            let aImages = [];

            if (beforeCount > 0 && afterCount === 0) {
                imageType = "B";
                aImages = this.oModel.getProperty("/beforeImages");
            } else if (afterCount > 0 && beforeCount === 0) {
                imageType = "A";
                aImages = this.oModel.getProperty("/afterImages");
            } else if (beforeCount > 0 && afterCount > 0) {
                MessageBox.error("Invalid state: Cannot have both before and after images at the same time.");
                return;
            } else {
                MessageBox.warning("No images to save");
                return;
            }

            if (aImages.length === 0) {
                MessageBox.warning("No images found");
                return;
            }

            sap.ui.core.BusyIndicator.show(0);

            try {
                await this._loadPdfMake();
                console.log("pdfMake loaded");

                // Fetch inspection codes and status from backend
                const inspectionData = await this._fetchInspectionData();
                const docDefinition = this._createPDFDefinition(imageType, aImages, inspectionData);

                // Get pdfMake instance from window or loader
                const pdfMakeInstance = pdfMakeLoader.getInstance();

                console.log("=== DEBUG pdfMakeInstance ===");
                console.log("pdfMakeInstance:", pdfMakeInstance);
                console.log("typeof pdfMakeInstance:", typeof pdfMakeInstance);
                console.log("pdfMakeInstance?.createPdf:", typeof pdfMakeInstance?.createPdf);
                console.log("window.pdfMake:", typeof window.pdfMake);
                console.log("window.pdfMake?.createPdf:", typeof window.pdfMake?.createPdf);
                console.log("=== END DEBUG ===");

                if (!pdfMakeInstance || typeof pdfMakeInstance.createPdf !== "function") {
                    console.error("FAILED CHECK - Instance or createPdf missing");
                    throw new Error("pdfMake not properly loaded - instance: " + typeof pdfMakeInstance + ", createPdf: " + typeof pdfMakeInstance?.createPdf);
                }

                console.log("pdfMake instance retrieved successfully:", typeof pdfMakeInstance, typeof pdfMakeInstance.createPdf);

                const pdfBase64 = await new Promise((resolve) => {
                    pdfMakeInstance.createPdf(docDefinition).getBase64(resolve);
                });

                console.log("PDF created successfully, length:", pdfBase64.length);

                const byteCharacters = atob(pdfBase64);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const pdfBlob = new Blob([byteArray], { type: "application/pdf" });

                console.log("PDF Blob created, size:", (pdfBlob.size / 1024 / 1024).toFixed(2), "MB");

                const document = this.oModel.getProperty("/document");
                const last2Digits = document.slice(-2);
                const prefix = imageType === "B" ? "BI" : "AI";
                const slug = `${document}/${prefix}Atta${last2Digits}(1).pdf`;

                console.log("Upload SLUG:", slug);

                await this._uploadPDFToBackend(pdfBlob, slug, imageType, aImages.length);

            } catch (e) {
                console.error("PDF generation or upload failed:", e);
                MessageBox.error("Failed to save images as PDF: " + e.message);
                sap.ui.core.BusyIndicator.hide();
            }
        },

        _fetchInspectionData() {
            return new Promise((resolve) => {
                const aFilters = this._createHeaderFilters();
                const oModel = this.getOwnerComponent().getModel();

                oModel.read("/InspectionHeaderSet", {
                    filters: aFilters,
                    urlParameters: {
                        "$expand": "np_on_Codes"
                    },
                    success: (oData) => {
                        if (oData.results && oData.results.length > 0) {
                            const oRecord = oData.results[0];
                            const aInspectionCodes = oRecord.np_on_Codes?.results || [];
                            const sStatus = oRecord.Status;

                            resolve({
                                status: sStatus,
                                codes: aInspectionCodes
                            });
                        } else {
                            resolve({
                                status: "",
                                codes: []
                            });
                        }
                    },
                    error: (oError) => {
                        console.error("Error fetching inspection data:", oError);
                        resolve({
                            status: "",
                            codes: []
                        });
                    }
                });
            });
        },

        _createPDFDefinition(sType, aImages, inspectionData) {
            const document = this.oModel.getProperty("/document");
            const sequence = this.oModel.getProperty("/sequenceNumber");
            const carrier = this.oModel.getProperty("/carrierNumber");
            const carrierLineCode = this.oModel.getProperty("/carrierLine");
            const carrierLineDescription = this._getCarrierLineDescription(carrierLineCode);
            const carrierTypeCode = this.oModel.getProperty("/carrierType");
            const carrierTypeDescription = this._getCarrierTypeDescription(carrierTypeCode);
            const sCurrentUser = this._getCurrentUser();

            // Get inspection status and codes
            const sStatus = inspectionData?.status || "";
            const aInspectionCodes = inspectionData?.codes || [];
            const sStatusText = sStatus === 'A' ? 'ACCEPTED' : sStatus === 'R' ? 'REJECTED' : 'PENDING';

            const imageContent = [];

            aImages.forEach((oImage, index) => {
                if (index > 0) {
                    imageContent.push({ text: '', pageBreak: 'before' });
                }

                imageContent.push({
                    text: `${sType === 'B' ? 'Before' : 'After'} Loading - Image ${index + 1}/${aImages.length}`,
                    style: 'imageHeader',
                    margin: [0, 0, 0, 10]
                });

                imageContent.push({
                    text: `Captured: ${new Date(oImage.timestamp).toLocaleString()}`,
                    style: 'timestamp',
                    margin: [0, 0, 0, 15]
                });

                imageContent.push({
                    image: oImage.base64,
                    width: 500,
                    alignment: 'center'
                });
            });

            // Build inspection codes table body
            const metadataTableBody = [
                ['Document:', document],
                ['Sequence:', sequence],
                ['Carrier Number:', carrier],
                ['Carrier Line:', carrierLineDescription],
                ['Carrier Type:', carrierTypeDescription],
                ['Inspection Status:', { text: sStatusText, bold: true, color: sStatus === 'A' ? '#00AA00' : sStatus === 'R' ? '#CC0000' : '#666666' }],
                ['Inspection Date:', new Date().toLocaleString()],
                ['Total Images:', aImages.length.toString()],
                ['Inspector:', sCurrentUser]
            ];

            // Add inspection codes section if codes exist
            let inspectionCodesContent = [];
            if (aInspectionCodes.length > 0) {
                inspectionCodesContent = [
                    {
                        text: 'INSPECTION CODES',
                        style: 'sectionHeader',
                        margin: [0, 20, 0, 10]
                    },
                    {
                        style: 'codesTable',
                        table: {
                            widths: [60, '*'],
                            headerRows: 1,
                            body: [
                                [
                                    { text: 'Code', style: 'tableHeader', fillColor: '#0854A0', color: '#FFFFFF' },
                                    { text: 'Description', style: 'tableHeader', fillColor: '#0854A0', color: '#FFFFFF' }
                                ],
                                ...aInspectionCodes.map(code => [
                                    code.CodeValue || '',
                                    code.CodeText || ''
                                ])
                            ]
                        },
                        layout: 'lightHorizontalLines',
                        margin: [0, 0, 0, 20]
                    }
                ];
            }

            return {
                info: {
                    title: `${sType === 'B' ? 'Before' : 'After'} Loading Images`,
                    author: 'Inspection Tracker',
                    subject: `Container Inspection - ${document}`
                },
                pageSize: 'A4',
                pageOrientation: 'landscape',
                pageMargins: [40, 60, 40, 60],
                header: {
                    text: 'CONTAINER INSPECTION REPORT',
                    style: 'header',
                    alignment: 'center',
                    margin: [0, 20, 0, 0]
                },
                footer: function (currentPage, pageCount) {
                    return {
                        text: `Page ${currentPage} of ${pageCount}`,
                        alignment: 'center',
                        margin: [0, 10, 0, 0]
                    };
                },
                content: [
                    {
                        text: `${sType === 'B' ? 'BEFORE' : 'AFTER'} LOADING IMAGES`,
                        style: 'title',
                        margin: [0, 0, 0, 20]
                    },
                    {
                        style: 'metadataTable',
                        table: {
                            widths: [120, '*'],
                            body: metadataTableBody
                        },
                        layout: 'lightHorizontalLines',
                        margin: [0, 0, 0, 10]
                    },
                    ...inspectionCodesContent,
                    { text: '', pageBreak: 'after' },
                    ...imageContent
                ],
                styles: {
                    header: {
                        fontSize: 20,
                        bold: true,
                        color: '#0854A0'
                    },
                    title: {
                        fontSize: 14,
                        bold: true,
                        alignment: 'center',
                        color: '#0854A0'
                    },
                    metadataTable: {
                        fontSize: 11,
                        margin: [0, 5, 0, 15]
                    },
                    sectionHeader: {
                        fontSize: 14,
                        bold: true,
                        color: '#0854A0'
                    },
                    tableHeader: {
                        fontSize: 11,
                        bold: true
                    },
                    codesTable: {
                        fontSize: 10,
                        margin: [0, 5, 0, 15]
                    },
                    imageHeader: {
                        fontSize: 16,
                        bold: true,
                        color: '#0854A0'
                    },
                    timestamp: {
                        fontSize: 10,
                        italics: true,
                        color: '#666666'
                    }
                }
            };
        },

        _getCurrentUser() {
            try {
                if (sap.ushell && sap.ushell.Container) {
                    const oUserInfo = sap.ushell.Container.getService("UserInfo");
                    return oUserInfo.getId();
                }
            } catch (error) {
                console.warn("UserInfo service not available:", error);
            }

            try {
                const oModel = this.getOwnerComponent().getModel();
                const oHeaders = oModel.getHeaders();
                if (oHeaders && oHeaders["sap-client"]) {
                    return oHeaders["x-user"] || "SYSTEM_USER";
                }
            } catch (error) {
                console.warn("Unable to get user from model:", error);
            }

            return "UNKNOWN_USER";
        },

        _uploadPDFToBackend(pdfBlob, slug, imageType, imageCount) {
            const that = this;
            const oModel = this.getOwnerComponent().getModel();

            return new Promise((resolve, reject) => {
                oModel.refreshSecurityToken(
                    function () {
                        const sCSRFToken = oModel.getSecurityToken();
                        const sUrl = oModel.sServiceUrl + "/AttachmentSet";

                        const mHeaders = {
                            "Content-Type": "application/pdf",
                            "slug": slug,
                            "X-CSRF-Token": sCSRFToken,
                            "X-Requested-With": "XMLHttpRequest"
                        };

                        jQuery.ajax({
                            url: sUrl,
                            type: "POST",
                            data: pdfBlob,
                            headers: mHeaders,
                            processData: false,
                            contentType: "application/pdf",
                            success: function (data) {
                                console.log("Upload successful:", data);

                                if (imageType === "B") {
                                    that.oModel.setProperty("/beforeImages", []);
                                    that.oModel.setProperty("/beforeImageCount", 0);
                                } else {
                                    that.oModel.setProperty("/afterImages", []);
                                    that.oModel.setProperty("/afterImageCount", 0);
                                }

                                that.oModel.refresh(true);
                                that._updateHeaderFlagsAfterUpload(imageType);

                                console.log(`${imageCount} ${imageType === 'B' ? 'before' : 'after'} loading images saved successfully`);
                                resolve();
                            },
                            error: function (jqXHR, textStatus, errorThrown) {
                                console.error("Upload failed:", textStatus, errorThrown);
                                let sErrorMsg = "Upload failed: " + textStatus;
                                if (jqXHR.responseText) {
                                    try {
                                        const oError = JSON.parse(jqXHR.responseText);
                                        if (oError.error && oError.error.message) {
                                            sErrorMsg = oError.error.message.value;
                                        }
                                    } catch (e) {
                                        sErrorMsg = jqXHR.responseText;
                                    }
                                }
                                reject(new Error(sErrorMsg));
                            }
                        });
                    },
                    function () {
                        console.error("Could not refresh CSRF token");
                        reject(new Error("Could not refresh CSRF token"));
                    }
                );
            });
        },

        _updateHeaderFlagsAfterUpload(imageType) {
            console.log("=== UPDATING HEADER FLAGS ===");

            const aFilters = this._createHeaderFilters();
            const oModel = this.getOwnerComponent().getModel();

            oModel.read("/InspectionHeaderSet", {
                filters: aFilters,
                success: (oData) => {
                    if (oData.results && oData.results.length > 0) {
                        const oRecord = oData.results[0];

                        const oUpdateData = {
                            ChangedBy: "USER",
                            ChangedOn: new Date()
                        };

                        if (imageType === "B") {
                            oUpdateData.HasBeforeImg = true;
                        } else {
                            oUpdateData.HasAfterImg = true;
                        }

                        const sKey = oModel.createKey("/InspectionHeaderSet", {
                            Document: oRecord.Document,
                            Sequencenumber: oRecord.Sequencenumber,
                            CarrierNumber: oRecord.CarrierNumber,
                            InspectionDate: oRecord.InspectionDate
                        });

                        oModel.update(sKey, oUpdateData, {
                            success: function () {
                                console.log("Header flags updated successfully");
                            },
                            error: function (oError) {
                                console.error("Failed to update header flags:", oError);
                                MessageBox.error("Failed to update inspection flags");
                            }
                        });
                    } else {
                        console.error("Cannot find inspection record to update");
                        MessageBox.error("Cannot find inspection record to update");
                    }
                },
                error: (oError) => {
                    console.error("Error reading header:", oError);
                    MessageBox.error("Failed to read inspection record");
                }
            });
        },

        // ========================================
        // FINISH INSPECTION
        // ========================================

        onFinishInspection: async function () {
            console.log("=== FINISH INSPECTION CLICKED ===");

            const beforeCount = this.oModel.getProperty("/beforeImageCount");
            const afterCount = this.oModel.getProperty("/afterImageCount");

            // Check if at least one image is taken
            if (beforeCount === 0 && afterCount === 0) {
                MessageBox.warning("Please take at least 1 image to complete the inspection.");
                return;
            }

            if (beforeCount > 0 || afterCount > 0) {
                try {
                    sap.ui.core.BusyIndicator.show(0);
                    await this.onSaveAllImagesToPDF();
                    sap.ui.core.BusyIndicator.hide();
                    this._showCompletionDialog();
                } catch (error) {
                    sap.ui.core.BusyIndicator.hide();
                    console.error("Error saving images:", error);
                    MessageBox.error("Failed to save images: " + error.message);
                }
            }
        },

        _showCompletionDialog: function () {
            // Reset progress bar to show all 3 steps before showing completion dialog
            this._resetProgressBarToFullView();

            MessageBox.confirm(
                "Inspection completed successfully! Do you want to start a new inspection?",
                {
                    title: "Inspection Complete",
                    actions: [MessageBox.Action.YES, MessageBox.Action.NO],
                    emphasizedAction: MessageBox.Action.YES,
                    onClose: (sAction) => {
                        if (sAction === MessageBox.Action.YES) {
                            this._resetWizard();
                        }
                    }
                }
            );
        },

        _resetProgressBarToFullView: function () {
            console.log("=== RESETTING PROGRESS BAR TO FULL VIEW ===");

            try {
                const oStep1 = this.byId("DocumentDetailsStep");
                const inspStep = this.byId("InspectionCodesStep");
                const imgStep = this.byId("ImageUploadStep");

                if (!oStep1 || !inspStep || !imgStep) {
                    console.error("One or more wizard steps not found");
                    return;
                }

                // For existing records, reset the nextStep back to InspectionCodesStep
                // This will restore the full 3-step progress bar
                oStep1.setNextStep(inspStep);

                // Also set subsequentSteps to ensure progress bar shows all 3 steps
                if (typeof oStep1.setSubsequentSteps === 'function') {
                    oStep1.setSubsequentSteps([inspStep, imgStep]);
                }

                console.log("Progress bar reset: DocumentDetailsStep -> InspectionCodesStep -> ImageUploadStep");

            } catch (e) {
                console.error("Error resetting progress bar:", e.message);
            }
        },

        // ========================================
        // WIZARD CONTROL
        // ========================================

        onCompleteInspection() {
            MessageToast.show("Inspection completed successfully!");
            this._showSuccessPage();
        },

        _showSuccessPage() {
            this._oNavContainer.to(this.byId("successPage"));
        },

        onNewInspection() {
            MessageBox.confirm(
                "Carrier Data Saved Successfully.",
                {
                    title: "Confirm New Inspection",
                    actions: [MessageBox.Action.OK],
                    emphasizedAction: MessageBox.Action.OK,
                    onClose: (sAction) => {
                        if (sAction === MessageBox.Action.OK) {
                            this._resetWizard();
                        }
                    }
                }
            );
        },

        onWizardCancel() {
            this._resetWizard();
        },

        _resetWizard() {
            this._clearInputFields();

            const oDefectCodes = this.oModel.getProperty("/defectCodes");
            Object.keys(oDefectCodes).forEach(sKey => {
                oDefectCodes[sKey] = false;
            });
            this.oModel.setProperty("/defectCodes", oDefectCodes);
            this._uncheckAllCheckboxes();

            this.oModel.setProperty("/beforeImages", []);
            this.oModel.setProperty("/afterImages", []);
            this.oModel.setProperty("/beforeImageCount", 0);
            this.oModel.setProperty("/afterImageCount", 0);
            this.oModel.setProperty("/currentImageType", "B");

            this.capturedImageData = null;
            this.oModel.refresh(true);

            this.oModel.setProperty("/showAcceptRejectButtons", false);
            this.oModel.setProperty("/isRejectEnabled", true);
            this.oModel.setProperty("/isAccepted", false);
            this.oModel.setProperty("/savedCodes", []);
            this.oModel.setProperty("/isAcceptButtonEnabled", true);
            this.oModel.setProperty("/areCheckboxesEnabled", true);
            this._resetFlags();

            const oStep1 = this.byId("DocumentDetailsStep");
            const oStep2 = this.byId("InspectionCodesStep");
            const oStep3 = this.byId("ImageUploadStep");

            if (oStep1) oStep1.setValidated(false);
            if (oStep2) oStep2.setValidated(false);
            if (oStep3) oStep3.setValidated(false);

            this._wizard.setCurrentStep(oStep1);

            setTimeout(() => {
                this._wizard.goToStep(oStep1, true);
                console.log("Navigated to Step 1");
            }, 100);

            this._oNavContainer.backToPage(this.byId("wizardContentPage"));
        },

        _uncheckAllCheckboxes() {
            const oVBox1 = this.byId("_IDGenVBox1");
            const oVBox2 = this.byId("_IDGenVBox2");

            if (oVBox1) {
                const aItems1 = oVBox1.getItems();
                aItems1.forEach(oCheckbox => {
                    if (oCheckbox.setSelected) {
                        oCheckbox.setSelected(false);
                    }
                });
            }

            if (oVBox2) {
                const aItems2 = oVBox2.getItems();
                aItems2.forEach(oCheckbox => {
                    if (oCheckbox.setSelected) {
                        oCheckbox.setSelected(false);
                    }
                });
            }
        },

        wizardCompletedHandler() {
            MessageToast.show("All steps completed!");
        },

        onWizardStepActivate(oEvent) {
            console.log("=== Wizard Step Activated ===");

            const oStep = oEvent.getParameter("step");
            if (!oStep) return;

            const sStepId = oStep.getId();

            // Always maintain the default subsequent steps to keep progress bar as 1→2→3
            if (sStepId && sStepId.includes("DocumentDetailsStep")) {
                const oStep1 = this.byId("DocumentDetailsStep");
                const inspStep = this.byId("InspectionCodesStep");
                const imgStep = this.byId("ImageUploadStep");
                if (oStep1 && inspStep && imgStep) {
                    try {
                        if (typeof oStep1.setSubsequentSteps === 'function') {
                            oStep1.setSubsequentSteps([inspStep, imgStep]);
                        }
                        console.log("Step 1 subsequentSteps maintained as [InspectionCodesStep, ImageUploadStep]");
                    } catch (e) {
                        console.error("Error setting subsequent steps:", e);
                    }
                }
            }

            if (sStepId && sStepId.includes("ImageUploadStep")) {
                // Reset progress bar to show all 3 steps when on ImageUploadStep
                const oStep1 = this.byId("DocumentDetailsStep");
                const inspStep = this.byId("InspectionCodesStep");
                const imgStep = this.byId("ImageUploadStep");
                if (oStep1 && inspStep && imgStep) {
                    try {
                        if (typeof oStep1.setSubsequentSteps === 'function') {
                            oStep1.setSubsequentSteps([inspStep, imgStep]);
                        }
                        console.log("Progress bar reset to show all 3 steps when on ImageUploadStep");
                    } catch (e) {
                        console.error("Error resetting progress bar:", e);
                    }
                }

                setTimeout(() => {
                    this._setImageButtonStates();
                }, 100);
            }

            if (sStepId && sStepId.includes("InspectionCodesStep")) {
                const codes = this.oModel.getProperty("/inspectionCodes");
                if (!codes || codes.length === 0) {
                    console.warn("No inspection codes loaded, reloading...");
                    this._loadInspectionCodes();
                }

                // Re-validate step if codes were already accepted
                const isAccepted = this.oModel.getProperty("/isAccepted");
                const aSavedCodes = this.oModel.getProperty("/savedCodes") || [];
                if (isAccepted && aSavedCodes.length > 0) {
                    const oStep2 = this.byId("InspectionCodesStep");
                    if (oStep2 && !oStep2.getValidated()) {
                        oStep2.setValidated(true);
                        console.log("Step 2 re-validated because codes were already accepted");
                    }
                }
            }
        },

        onStepActivate: function (oEvent) {
            var that = this;
            setTimeout(function () {
                that.disablePreviousSteps();
            }, 500);

            // Re-validate Step 2 if codes were already accepted
            const oStep = oEvent.getParameter && oEvent.getParameter("step");
            if (oStep && oStep.getId && oStep.getId().includes("InspectionCodesStep")) {
                const isAccepted = this.oModel.getProperty("/isAccepted");
                const aSavedCodes = this.oModel.getProperty("/savedCodes") || [];
                if (isAccepted && aSavedCodes.length > 0) {
                    const oStep2 = this.byId("InspectionCodesStep");
                    if (oStep2 && !oStep2.getValidated()) {
                        setTimeout(() => {
                            oStep2.setValidated(true);
                            this._wizard.validateStep(oStep2);
                            console.log("Step 2 re-validated in onStepActivate");
                        }, 100);
                    }
                }
            }
        },

        disablePreviousSteps: function () {
            var currentStep = this._wizard.getProgressStep();
            var allSteps = this._wizard.getSteps();
            var currentIndex = allSteps.indexOf(currentStep);

            // Re-validate Step 2 if it's the current step and codes were already accepted
            if (currentStep && currentStep.getId && currentStep.getId().includes("InspectionCodesStep")) {
                const isAccepted = this.oModel.getProperty("/isAccepted");
                const aSavedCodes = this.oModel.getProperty("/savedCodes") || [];
                if (isAccepted && aSavedCodes.length > 0) {
                    const oStep2 = this.byId("InspectionCodesStep");
                    if (oStep2 && !oStep2.getValidated()) {
                        oStep2.setValidated(true);
                        this._wizard.validateStep(oStep2);
                        console.log("Step 2 re-validated in disablePreviousSteps");
                    }
                }
            }

            // Use CSS to disable previous steps in progress navigator
            setTimeout(function () {
                var progressNavItems = document.querySelectorAll(".sapMWizardProgressNavStep");
                for (var i = 0; i < currentIndex; i++) {
                    if (progressNavItems[i]) {
                        progressNavItems[i].style.pointerEvents = "none";
                        progressNavItems[i].style.opacity = "0.5";
                    }
                }
            }, 100);
        },

        _setImageButtonStates() {
            const hasBeforeImg = this.oModel.getProperty("/hasBeforeImg");
            const isRejected = this.oModel.getProperty("/isRejected");
            const recordStatus = this.oModel.getProperty("/recordStatus");
            const btnBefore = this.byId("btnBeforePhoto");
            const btnAfter = this.byId("btnAfterPhoto");

            if (!btnBefore || !btnAfter) return;

            // For rejected carriers, disable after photos button
            if (isRejected || recordStatus === 'R') {
                btnBefore.setEnabled(true);
                btnAfter.setEnabled(false);
                console.log("After photos button disabled - carrier is rejected");
                return;
            }

            if (hasBeforeImg === 'X' || hasBeforeImg === true) {
                btnBefore.setEnabled(false);
                btnAfter.setEnabled(true);
            } else {
                btnBefore.setEnabled(true);
                btnAfter.setEnabled(false);
            }
        }
    });
});
