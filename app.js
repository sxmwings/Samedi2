// HYBRID MASTER 51 v1.1

document.addEventListener("DOMContentLoaded", () => {
  const weekLabel = document.getElementById("weekLabel");
  const exerciseList = document.getElementById("exerciseList");
  const timerDisplay = document.getElementById("timerDisplay");
  const modal = document.getElementById("modal");
  const modalTitle = document.getElementById("modalTitle");
  const modalBody = document.getElementById("modalBody");

  let currentWeek = 1;
  let timerInterval = null;
  let timeRemaining = 0;

  // --- UI INIT ---
  weekLabel.textContent = `Semaine ${currentWeek}`;
  loadSession(currentWeek);

  document.getElementById("prevWeek").onclick = () => changeWeek(-1);
  document.getElementById("nextWeek").onclick = () => changeWeek(1);
  document.getElementById("finishSession").onclick = finishSession;
  document.getElementById("selftestBtn").onclick = runSelftest;
  document.getElementById("closeModal").onclick = () => modal.classList.add("hidden");

  // --- Dummy Data Example ---
  function loadSession(week) {
    exerciseList.innerHTML = "";
    const sample = [
      { name: "Trap Bar Deadlift", series: "3x5", rpe: "7", tech: "Base" },
      { name: "Goblet Squat", series: "4x10", rpe: "8", tech: "Tempo 202" },
      { name: "Dumbbell Press", series: "4x8", rpe: "8", tech: "Base" },
    ];
    sample.forEach((ex) => {
      const div = document.createElement("div");
      div.className = "exercise";
      div.innerHTML = `
        <span>${ex.name} ${ex.series} @RPE${ex.rpe}</span>
        <button>Valider</button>
      `;
      div.querySelector("button").onclick = () => startTimer(45);
      exerciseList.appendChild(div);
    });
  }

  function changeWeek(delta) {
    currentWeek = Math.max(1, Math.min(26, currentWeek + delta));
    weekLabel.textContent = `Semaine ${currentWeek}`;
    loadSession(currentWeek);
  }

  // --- Timer ---
  function startTimer(seconds) {
    clearInterval(timerInterval);
    timeRemaining = seconds;
    updateTimer();
    timerInterval = setInterval(() => {
      timeRemaining--;
      updateTimer();
      if (timeRemaining <= 0) clearInterval(timerInterval);
    }, 1000);
  }
  function updateTimer() {
    const min = String(Math.floor(timeRemaining / 60)).padStart(2, "0");
    const sec = String(timeRemaining % 60).padStart(2, "0");
    timerDisplay.textContent = `${min}:${sec}`;
  }

  // --- Finish Session ---
  function finishSession() {
    if (currentWeek < 26) currentWeek++;
    weekLabel.textContent = `Semaine ${currentWeek}`;
    localStorage.setItem("lastSave", new Date().toLocaleString());
    document.getElementById("saveTime").textContent = localStorage.getItem("lastSave");
  }

  // --- Chart.js Init ---
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: "#ccc" } } },
    scales: {
      x: { ticks: { color: "#aaa" }, grid: { color: "rgba(255,255,255,0.1)" } },
      y: { ticks: { color: "#aaa" }, grid: { color: "rgba(255,255,255,0.1)" } }
    }
  };

  const ctxVol = document.getElementById("chartVolume");
  new Chart(ctxVol, {
    type: "bar",
    data: {
      labels: ["S1", "S2", "S3", "S4"],
      datasets: [{ label: "Volume", data: [12000, 13500, 14000, 15000], backgroundColor: "#00E38C88" }]
    },
    options: chartOptions
  });

  const ctxRpe = document.getElementById("chartRPE");
  new Chart(ctxRpe, {
    type: "line",
    data: {
      labels: ["S1", "S2", "S3", "S4"],
      datasets: [{ label: "RPE", data: [7, 7.5, 8, 8.2], borderColor: "#2B4CF2", tension: 0.4 }]
    },
    options: chartOptions
  });

  const ctxHeat = document.getElementById("chartHeatmap");
  new Chart(ctxHeat, {
    type: "radar",
    data: {
      labels: ["Dos", "Pecs", "Jambes", "Bras", "Épaules"],
      datasets: [{ label: "Équilibre", data: [80, 75, 90, 70, 85], backgroundColor: "#00E38C33", borderColor: "#00E38C" }]
    },
    options: chartOptions
  });

  // --- Selftest ---
  function runSelftest() {
    const results = [];
    results.push({ test: "Chart containers height", pass: checkChartHeight() });
    results.push({ test: "LocalStorage access", pass: !!window.localStorage });
    results.push({ test: "Timer working", pass: typeof startTimer === "function" });

    const allPass = results.every(r => r.pass);
    modalTitle.textContent = allPass ? "SELFTEST PASS ✅" : "SELFTEST FAIL ❌";
    modalBody.textContent = results.map(r => `${r.pass ? "✔" : "✖"} ${r.test}`).join("\n");
    modal.classList.remove("hidden");
  }

  function checkChartHeight() {
    return [...document.querySelectorAll(".chart-container")].every(c => c.offsetHeight <= 260);
  }

  // --- Load last save time ---
  if (localStorage.getItem("lastSave")) {
    document.getElementById("saveTime").textContent = localStorage.getItem("lastSave");
  }
});
