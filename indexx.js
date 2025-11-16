// indexx.js — REPLACEMENT
const stateKey = "weekPlanner.v2.tasks";
let tasks = JSON.parse(localStorage.getItem(stateKey) || "[]");

// DOM
const mainView = document.getElementById("mainView");
const editView = document.getElementById("editView");
const todayTasksDiv = document.getElementById("todayTasks");
const goEditBtn = document.getElementById("goEdit");
const backTodayBtn = document.getElementById("backToday");

const taskForm = document.getElementById("taskForm");
const weekGrid = document.getElementById("weekGrid");

// Overlays / modals
const completeOverlay = document.getElementById("completeOverlay");
const reminderPrompt = document.getElementById("reminderPrompt");
const reminderPromptText = document.getElementById("reminderPromptText");
const reminderTaskInfo = document.getElementById("reminderTaskInfo");
const reminderYesBtn = document.getElementById("reminderYesBtn");
const reminderNoBtn = document.getElementById("reminderNoBtn");

const alarmModal = document.getElementById("alarmModal");
const alarmTaskName = document.getElementById("alarmTaskName");
const alarmTaskTime = document.getElementById("alarmTaskTime");
const alarmSnoozeBtn = document.getElementById("alarmSnoozeBtn");
const alarmStopBtn = document.getElementById("alarmStopBtn");

const fallbackAudio = document.getElementById("fallbackAlarmAudio");
const alarmSound = document.getElementById("alarmSound");

// Helpers
const uid = () => crypto.randomUUID();
const save = () => localStorage.setItem(stateKey, JSON.stringify(tasks));
const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });

/* ---------------------------
   WebAudio alarm helper
   --------------------------- */
let audioCtx = null;
let alarmOsc = null;
let alarmGain = null;
function startAlarmSound() {
  try {
    alarmSound.currentTime = 0;
    alarmSound.loop = true;
    alarmSound.play();
  } catch (e) {
    console.warn("Could not play alarm sound", e);
  }
}
function stopAlarmSound() {
  try {
    if (!alarmSound.paused) {
      alarmSound.pause();
    }
    alarmSound.currentTime = 0;
    alarmSound.loop = false; // ensure it stops looping
    // force reload in case it still plays
    alarmSound.load();
  } catch (e) {
    console.warn("Could not stop alarm sound", e);
  }
}



/* ---------------------------
   Utility: parse time string "HH:MM" -> minutes since midnight
   --------------------------- */
function parseHM(hm) {
  if (!hm) return 0;
  const [hh, mm] = hm.split(":").map(Number);
  return hh * 60 + mm;
}

/* ---------------------------
   Reminder logic
   - If a task has t.reminder === true and it is scheduled for today and has start time,
     the background checker will trigger the alarm when current time matches the task start.
   - The checker runs every 5 seconds (safe and responsive).
   --------------------------- */

let pendingAlarm = null; // { taskId, timeMinutes }
function checkRemindersNow() {
  const now = new Date();
  const nowDay = now.toLocaleDateString('en-US', { weekday: 'long' });
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const due = tasks.find(t => {
    if (!t.reminder || t.day !== nowDay || !t.start) return false;

    const taskMinutes = parseHM(t.start);

    // Skip if already triggered for this minute
    if (t.lastTriggered === nowMinutes) return false;

    return taskMinutes === nowMinutes;
  });

  if (due && (!pendingAlarm || pendingAlarm.taskId !== due.id)) {
    // Mark it triggered for this minute
    due.lastTriggered = nowMinutes;
    triggerAlarmForTask(due);
    save(); // persist lastTriggered
  }
}

function triggerAlarmForTask(task) {
  pendingAlarm = { taskId: task.id, timeMinutes: parseHM(task.start) };

  alarmTaskName.textContent = task.name;
  alarmTaskTime.textContent = `${task.day} • ${task.start}${task.end ? (" — " + task.end) : ""}`;


  alarmModal.classList.remove('hidden');

  startAlarmSound();
}


/* Snooze adds 5 minutes to the pendingAlarm and will retrigger in 5 minutes */
function snoozePendingAlarm() {
  if (!pendingAlarm) return;
  // add 5 minutes
  const newMinutes = pendingAlarm.timeMinutes + 5;
  pendingAlarm.timeMinutes = newMinutes;
  // stop current sound + modal (we'll reopen when time matches)
  stopAlarmSound();
  alarmModal.classList.add('hidden');
  // set a small timeout to re-check exactly at next minute (approx)
  setTimeout(() => {
    // we won't schedule a setTimeout to exact minute to keep it simple — background checker will find it
  }, 1000);
}

/* Stop clears the current alarm */
function stopPendingAlarm() {
  if (!pendingAlarm) return;

  // mark the task as triggered so checker won't fire again this minute
  const t = tasks.find(x => x.id === pendingAlarm.taskId);
  if (t) {
    const now = new Date();
    t.lastTriggered = parseHM(t.start); // mark as triggered for this minute
    save();
  }

  // stop sound & hide modal
  stopAlarmSound();
  alarmModal.classList.add('hidden');

  // clear pending alarm
  pendingAlarm = null;

  renderMainView(); // refresh main view to update bell icons
}


/* Hook alarm buttons */
alarmSnoozeBtn.onclick = () => {
  snoozePendingAlarm();
};
alarmStopBtn.onclick = () => {
  stopPendingAlarm();
};

/* run background check every 5 seconds */
setInterval(checkRemindersNow, 5000);

/* ---------------------------
   Rendering (main + edit)
   --------------------------- */
function renderMainView() {
  todayTasksDiv.innerHTML = "";
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  const todayTasks = tasks.filter(t => t.day === today);
  todayTasks.sort((a, b) => parseHM(a.start) - parseHM(b.start));
  todayTasks.forEach(t => {
    const div = document.createElement("div");
    div.className = "task" + (t.done ? " done" : "");
    div.dataset.id = t.id;
    div.innerHTML = `
      <div class="task-info" tabindex="0">
        <div class="name">${escapeHtml(t.name)}</div>
        <div class="details">${t.start || "--"} ${t.end ? ("— " + t.end) : ""} [${t.category}]</div>
      </div>
      <div class="task-toolbar">
      <button class="reminder-toggle-btn" data-tooltip="${t.reminder ? "Deactivate Reminder" : "Activate Reminder"}">
      ${t.reminder ? "🔕" : "🔔"}
    </button>
      <button class="complete-btn" data-tooltip="Complete">✔</button>
        <button class="edit-btn" data-tooltip="Edit">✏️</button>
        <button class="delete-btn" data-tooltip="Delete">🗑️</button>
      </div>
    `;

    const completeBtn = div.querySelector(".complete-btn");
    const editBtn = div.querySelector(".edit-btn");
    const deleteBtn = div.querySelector(".delete-btn");
    const infoDiv = div.querySelector(".task-info");

    const reminderBtn = div.querySelector(".reminder-toggle-btn");

reminderBtn.onclick = (ev) => {
  ev.stopPropagation(); // prevent triggering infoDiv click
  t.reminder = !t.reminder;
  save();
  // 🔔 = reminder active, 🔕 = reminder inactive
  reminderBtn.textContent = t.reminder ? "🔔" : "🔕";
  reminderBtn.dataset.tooltip = t.reminder ? "Deactivate Reminder" : "Activate Reminder";
  renderMainView(); // ensure red line / icon updates immediately
};



    // complete behavior: toggle done, show big overlay + confetti
    completeBtn.onclick = () => {
      t.done = !t.done;
      save();
      // show big overlay if completed
      if (t.done) {
        completeOverlay.classList.remove('hidden');
        completeOverlay.classList.add('show');
        try {
          confetti({
            particleCount: 180,
            spread: 80,
            origin: { y: 0.35 }
          });
        } catch (e) {}
        // auto-hide after 1.5s
        setTimeout(() => {
          completeOverlay.classList.add('hidden');
          completeOverlay.classList.remove('show');
        }, 1500);
      }
      renderMainView();
      renderEditView();
    };

    // delete
    deleteBtn.onclick = (ev) => {
      ev.stopPropagation();
      tasks = tasks.filter(x => x.id !== t.id);
      save();
      renderMainView();
      renderEditView();
    };

    // edit (inline)
    editBtn.onclick = (ev) => {
      ev.stopPropagation();
      if (div.querySelector(".task-editor")) return;
      const editor = document.createElement("div");
      editor.className = "task-editor";
      editor.innerHTML = `
        <input type="text" value="${escapeHtml(t.name)}"/>
        <input type="time" value="${t.start || ''}"/>
        <input type="time" value="${t.end || ''}"/>
        <select>
          <option${t.category === "General" ? " selected" : ""}>General</option>
          <option${t.category === "Work" ? " selected" : ""}>Work</option>
          <option${t.category === "Study" ? " selected" : ""}>Study</option>
          <option${t.category === "Personal" ? " selected" : ""}>Personal</option>
          <option${t.category === "Gym" ? " selected" : ""}>Gym</option>
        </select>
        <button class="save-edit-btn">Save</button>
      `;
      const saveBtn = editor.querySelector(".save-edit-btn");
      const inputs = editor.querySelectorAll("input,select");
      saveBtn.onclick = () => {
        t.name = inputs[0].value;
        t.start = inputs[1].value;
        t.end = inputs[2].value;
        t.category = inputs[3].value;
        save();
        renderMainView();
        renderEditView();
      };
      div.appendChild(editor);
    };

    // clicking the info div opens reminder prompt for that task
    infoDiv.onclick = () => {
      openReminderPrompt(t.id);
    };

    todayTasksDiv.appendChild(div);
  });
}

/* ---------------------------
   Render Edit View (week grid)
   Also add tooltip attribute to delete button here
   --------------------------- */
function renderEditView() {
  document.querySelectorAll(".task-list").forEach(l => l.innerHTML = "");
  tasks.sort((a, b) => parseHM(a.start) - parseHM(b.start));
  tasks.forEach(t => {
    const column = document.querySelector(`[data-day="${t.day}"] .task-list`);
    if (!column) return;
    const card = document.createElement("div");
    card.className = "task";
    card.draggable = true;
    card.dataset.id = t.id;
    if (t.done) card.classList.add("done");
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div style="display:flex;flex-direction:column;gap:4px">
          <div><strong>${escapeHtml(t.name)}</strong> [${t.category}]</div>
          <div style="font-size:12px;color:#6b7280">
            ${t.start || "--"} ${t.end ? ("— " + t.end) : ""}
          </div>
        </div>
        <button class="delete-btn" data-tooltip="Delete">🗑️</button>
      </div>
    `;
    const del = card.querySelector(".delete-btn");
    del.onclick = () => {
      tasks = tasks.filter(x => x.id !== t.id);
      save();
      renderEditView();
      renderMainView();
    };
    column.appendChild(card);

    card.addEventListener("dragstart", () => card.classList.add("dragging"));
   card.addEventListener("dragend", () => {
  card.classList.remove("dragging");
  save();
  renderEditView(); // refresh week grid immediately
  renderMainView(); // refresh today's tasks
});

  });

  document.querySelectorAll(".task-list").forEach(list => {
    list.addEventListener("dragover", e => {
      e.preventDefault();
      const dragging = document.querySelector(".dragging");
      if (!dragging) return;
      list.appendChild(dragging);
      const tid = dragging.dataset.id;
      const t = tasks.find(x => x.id === tid);
      if (t) t.day = list.parentElement.dataset.day;
    });
  });
}

/* ---------------------------
   Form submit — keep same behavior
   --------------------------- */
taskForm.addEventListener("submit", e => {
  e.preventDefault();
  const name = document.getElementById("taskName").value.trim();
  if (!name) return;
  const category = document.getElementById("taskCategory").value;
  const day = document.getElementById("taskDay").value;
  const start = document.getElementById("startTime").value;
  const end = document.getElementById("endTime").value;
  const recurring = document.getElementById("recurring").value;

  const daysToAdd = recurring === "daily" ? ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] : [day];

  daysToAdd.forEach(d => {
  const newTask = { id: uid(), name, category, day: d, start, end, done: false, recurring, reminder: false };
  tasks.push(newTask);

  // OPEN REMINDER PROMPT IMMEDIATELY
  openReminderPrompt(newTask.id);
});

  save();
  renderEditView();
  renderMainView();
  taskForm.reset();
});

/* ---------------------------
   Screen toggles
   --------------------------- */
goEditBtn.onclick = () => { mainView.classList.add("hidden"); editView.classList.remove("hidden"); }
backTodayBtn.onclick = () => { editView.classList.add("hidden"); mainView.classList.remove("hidden"); }

/* ---------------------------
   Reminder prompt flow
   - opens prompt for a given task id
   - Yes sets t.reminder = true and hides prompt
   - No hides prompt and sets t.reminder = false
   --------------------------- */
let reminderOpenTaskId = null;
function openReminderPrompt(taskId) {
  const t = tasks.find(x => x.id === taskId);
  if (!t) return;
  reminderOpenTaskId = taskId;
  reminderTaskInfo.textContent = `${t.day} • ${t.start || "--"} ${t.end ? ("— " + t.end) : ""}`;
  reminderPrompt.classList.remove('hidden');
  // ensure accessibility focus
  reminderYesBtn.focus();
}


reminderYesBtn.onclick = () => {
  if (!reminderOpenTaskId) return;
  const t = tasks.find(x => x.id === reminderOpenTaskId);
  if (!t) return;

  // If task has no start time, set a default: next minute
  if (!t.start) {
    const now = new Date();
    const next = new Date(now.getTime() + 60 * 1000);
    const hh = String(next.getHours()).padStart(2, '0');
    const mm = String(next.getMinutes()).padStart(2, '0');
    t.start = `${hh}:${mm}`;
  }

  // Enable reminder
  t.reminder = true;

 
  save(); // your existing save function
  reminderPrompt.classList.add('hidden');
  reminderOpenTaskId = null;
};


/*  old code
reminderYesBtn.onclick = () => {
  if (!reminderOpenTaskId) return;
  const t = tasks.find(x => x.id === reminderOpenTaskId);
  if (!t) return;
  // If task has no start time, remind user
  if (!t.start) {
    // set a default: immediate next minute
    const now = new Date();
    const next = new Date(now.getTime() + 60 * 1000);
    const hh = String(next.getHours()).padStart(2, '0');
    const mm = String(next.getMinutes()).padStart(2, '0');
    t.start = `${hh}:${mm}`;
  }
  t.reminder = true;
  save();
  reminderPrompt.classList.add('hidden');
  reminderOpenTaskId = null;
};  old code  */

reminderNoBtn.onclick = () => {
  if (reminderOpenTaskId) {
    const t = tasks.find(x => x.id === reminderOpenTaskId);
    if (t) { t.reminder = false; save(); }
  }
  reminderPrompt.classList.add('hidden');
  reminderOpenTaskId = null;
};



/* ---------------------------
   Escape HTML helper (simple)
   --------------------------- */
function escapeHtml(s) {
  return (s + "").replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

/* ---------------------------
   initial render
   --------------------------- */
renderMainView();
renderEditView();
