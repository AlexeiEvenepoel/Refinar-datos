class CSVProcessor {
  constructor() {
    this.currentFile = null;
    this.isProcessing = false;
    this.startTime = null;
    this.progressInterval = null;

    this.init();
  }

  init() {
    this.bindEvents();
    this.setupRangeInputs();
  }

  bindEvents() {
    // File input events
    const dropZone = document.getElementById("drop-zone");
    const fileInput = document.getElementById("file-input");
    const removeFileBtn = document.getElementById("remove-file");
    const processBtn = document.getElementById("process-btn");
    const restartBtn = document.getElementById("restart-btn");
    const errorRestartBtn = document.getElementById("error-restart-btn");

    // Drop zone events
    dropZone.addEventListener("click", () => fileInput.click());
    dropZone.addEventListener("dragover", this.handleDragOver.bind(this));
    dropZone.addEventListener("dragleave", this.handleDragLeave.bind(this));
    dropZone.addEventListener("drop", this.handleDrop.bind(this));

    // File input change
    fileInput.addEventListener("change", this.handleFileSelect.bind(this));

    // Remove file
    removeFileBtn.addEventListener("click", this.removeFile.bind(this));

    // Process button
    processBtn.addEventListener("click", this.processFile.bind(this));

    // Restart buttons
    restartBtn.addEventListener("click", this.restart.bind(this));
    errorRestartBtn.addEventListener("click", this.restart.bind(this));

    // Prevent default drag behaviors
    ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
      document.addEventListener(eventName, this.preventDefaults, false);
    });
  }

  setupRangeInputs() {
    const ranges = [
      "concurrency-transform",
      "concurrency-images",
      "concurrency-descriptions",
    ];

    ranges.forEach((id) => {
      const input = document.getElementById(id);
      const valueSpan = input.parentElement.querySelector(".config-value");

      input.addEventListener("input", (e) => {
        valueSpan.textContent = e.target.value;
      });
    });
  }

  preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  handleDragOver(e) {
    e.preventDefault();
    document.getElementById("drop-zone").classList.add("drag-over");
  }

  handleDragLeave(e) {
    e.preventDefault();
    document.getElementById("drop-zone").classList.remove("drag-over");
  }

  handleDrop(e) {
    e.preventDefault();
    document.getElementById("drop-zone").classList.remove("drag-over");

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      this.handleFile(files[0]);
    }
  }

  handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
      this.handleFile(file);
    }
  }

  handleFile(file) {
    // Validate file type
    if (!file.name.toLowerCase().endsWith(".csv")) {
      this.showError("Por favor selecciona un archivo CSV válido.");
      return;
    }

    // Validate file size (50MB max)
    if (file.size > 50 * 1024 * 1024) {
      this.showError("El archivo es demasiado grande. Máximo 50MB permitido.");
      return;
    }

    this.currentFile = file;
    this.showFileInfo(file);
    this.showConfigPanel();
    this.showActionPanel();
  }

  showFileInfo(file) {
    const fileInfo = document.getElementById("file-info");
    const fileName = document.getElementById("file-name");
    const fileSize = document.getElementById("file-size");

    fileName.textContent = file.name;
    fileSize.textContent = this.formatFileSize(file.size);

    fileInfo.style.display = "block";
    document.getElementById("drop-zone").style.display = "none";
  }

  showConfigPanel() {
    document.getElementById("config-panel").style.display = "block";
  }

  showActionPanel() {
    document.getElementById("action-panel").style.display = "block";
  }

  removeFile() {
    this.currentFile = null;
    document.getElementById("file-info").style.display = "none";
    document.getElementById("config-panel").style.display = "none";
    document.getElementById("action-panel").style.display = "none";
    document.getElementById("drop-zone").style.display = "block";
    document.getElementById("file-input").value = "";
  }

  async processFile() {
    if (!this.currentFile || this.isProcessing) return;

    this.isProcessing = true;
    this.startTime = Date.now();

    // Show processing section
    this.showSection("processing-section");

    // Get configuration values
    const config = {
      concurrencyTransform: parseInt(
        document.getElementById("concurrency-transform").value
      ),
      concurrencyImages: parseInt(
        document.getElementById("concurrency-images").value
      ),
      concurrencyDescriptions: parseInt(
        document.getElementById("concurrency-descriptions").value
      ),
    };

    // Start progress simulation
    this.startProgressSimulation();

    try {
      // Create FormData
      const formData = new FormData();
      formData.append("csvFile", this.currentFile);
      formData.append("concurrencyTransform", config.concurrencyTransform);
      formData.append("concurrencyImages", config.concurrencyImages);
      formData.append(
        "concurrencyDescriptions",
        config.concurrencyDescriptions
      );

      // Make request
      const response = await fetch("/api/products/process", {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        // Stop progress simulation
        this.stopProgressSimulation();

        // Complete progress
        this.setProgress(100);
        this.completeAllSteps();

        // Download file
        const blob = await response.blob();
        this.downloadFile(blob, "productos_procesados.zip");

        // Show success
        setTimeout(() => {
          this.showSection("success-section");
        }, 1000);
      } else {
        const errorData = await response.json();
        throw new Error(errorData.message || "Error en el procesamiento");
      }
    } catch (error) {
      console.error("Error:", error);
      this.stopProgressSimulation();
      this.showError(error.message);
    } finally {
      this.isProcessing = false;
    }
  }

  startProgressSimulation() {
    let progress = 0;
    let currentStep = 1;

    // Update initial step
    this.updateStep(1, "active", "Procesando...");

    this.progressInterval = setInterval(() => {
      // Simulate realistic progress based on typical processing times
      const elapsed = Date.now() - this.startTime;
      const minutes = elapsed / (1000 * 60);

      // Estimate total time based on file size and configuration
      const estimatedMinutes = this.estimateProcessingTime();
      const progressIncrement = Math.random() * 2 + 0.5; // 0.5-2.5% per interval

      progress = Math.min(progress + progressIncrement, 95); // Never go above 95% in simulation

      this.setProgress(progress);
      this.updateETA(elapsed, progress);

      // Update steps based on progress
      if (progress > 20 && currentStep === 1) {
        this.updateStep(1, "completed", "Completado");
        this.updateStep(2, "active", "Procesando...");
        currentStep = 2;
      } else if (progress > 50 && currentStep === 2) {
        this.updateStep(2, "completed", "Completado");
        this.updateStep(3, "active", "Procesando...");
        currentStep = 3;
      } else if (progress > 80 && currentStep === 3) {
        this.updateStep(3, "completed", "Completado");
        this.updateStep(4, "active", "Procesando...");
        currentStep = 4;
      }
    }, 500); // Update every 500ms
  }

  stopProgressSimulation() {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
  }

  estimateProcessingTime() {
    // Estimate based on file size (rough calculation)
    const fileSizeMB = this.currentFile.size / (1024 * 1024);
    const baseTime = 2; // 2 minutes base
    const sizeMultiplier = fileSizeMB * 0.1; // 0.1 minutes per MB
    return baseTime + sizeMultiplier;
  }

  setProgress(percentage) {
    const progressFill = document.getElementById("progress-fill");
    const progressPercentage = document.getElementById("progress-percentage");

    progressFill.style.width = `${percentage}%`;
    progressPercentage.textContent = `${Math.round(percentage)}%`;
  }

  updateETA(elapsed, progress) {
    const etaElement = document.getElementById("progress-eta");

    if (progress > 5) {
      const totalEstimated = (elapsed / progress) * 100;
      const remaining = totalEstimated - elapsed;

      if (remaining > 0) {
        const minutes = Math.ceil(remaining / (1000 * 60));
        etaElement.textContent = `~${minutes} min restante${
          minutes !== 1 ? "s" : ""
        }`;
      } else {
        etaElement.textContent = "Finalizando...";
      }
    } else {
      etaElement.textContent = "Calculando tiempo...";
    }
  }

  updateStep(stepNumber, status, statusText) {
    const step = document.getElementById(`step-${stepNumber}`);
    const statusElement = step.querySelector(".step-status");

    // Remove existing status classes
    step.classList.remove("active", "completed");

    // Add new status
    if (status !== "waiting") {
      step.classList.add(status);
    }

    statusElement.textContent = statusText;
  }

  completeAllSteps() {
    for (let i = 1; i <= 4; i++) {
      this.updateStep(i, "completed", "Completado");
    }
  }

  downloadFile(blob, filename) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.style.display = "none";
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }

  showSection(sectionId) {
    // Hide all sections
    const sections = [
      "upload-section",
      "processing-section",
      "success-section",
      "error-section",
    ];
    sections.forEach((id) => {
      document.getElementById(id).style.display = "none";
    });

    // Show target section
    document.getElementById(sectionId).style.display = "block";
  }

  showError(message) {
    document.getElementById("error-message").textContent = message;
    this.showSection("error-section");
  }

  restart() {
    // Reset all state
    this.currentFile = null;
    this.isProcessing = false;
    this.startTime = null;
    this.stopProgressSimulation();

    // Reset UI
    this.removeFile();
    this.showSection("upload-section");

    // Reset progress
    this.setProgress(0);
    document.getElementById("progress-eta").textContent =
      "Calculando tiempo...";

    // Reset steps
    for (let i = 1; i <= 4; i++) {
      this.updateStep(i, "waiting", "En espera...");
    }

    // Reset processing status
    document.getElementById("processing-status").textContent =
      "Iniciando procesamiento...";
  }

  formatFileSize(bytes) {
    if (bytes === 0) return "0 Bytes";

    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }
}

// Initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  new CSVProcessor();
});
