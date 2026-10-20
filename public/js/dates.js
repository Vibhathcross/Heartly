const DatesManager = {
  dates: [],
  currentMonth: new Date().getMonth(),
  currentYear: new Date().getFullYear(),

  async init() {
    this.setupEvents();
    await this.loadDates();
  },

  setupEvents() {
    // Month navigation
    document.getElementById('calPrevMonth')?.addEventListener('click', () => {
      this.currentMonth--;
      if (this.currentMonth < 0) {
        this.currentMonth = 11;
        this.currentYear--;
      }
      this.renderCalendar();
    });

    document.getElementById('calNextMonth')?.addEventListener('click', () => {
      this.currentMonth++;
      if (this.currentMonth > 11) {
        this.currentMonth = 0;
        this.currentYear++;
      }
      this.renderCalendar();
    });

    // Propose Date modal
    const modal = document.getElementById('proposeDateModal');
    document.getElementById('btnOpenProposeModal')?.addEventListener('click', () => {
      modal.style.display = 'flex';
      // Default date to tomorrow
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      document.getElementById('dateInputDate').value = tomorrow.toISOString().split('T')[0];
    });

    document.getElementById('btnCloseProposeModal')?.addEventListener('click', () => {
      modal.style.display = 'none';
    });

    // Submit date proposal
    document.getElementById('proposeDateForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = document.getElementById('dateInputTitle').value.trim();
      const date = document.getElementById('dateInputDate').value;
      const time = document.getElementById('dateInputTime').value;
      const location = document.getElementById('dateInputLocation').value.trim();
      const notes = document.getElementById('dateInputNotes').value.trim();

      if (!title || !date) return;

      try {
        const res = await API.requestDate({ title, date, time, location, notes });
        const newDate = res.datePlan;
        this.dates.push(newDate);
        window.SocketManager.emitDateProposed(newDate);

        modal.style.display = 'none';
        document.getElementById('proposeDateForm').reset();
        this.render();
        HeartlyDialog.alert('Date invitation sent to your partner! Waiting for them to accept ❤️', 'Date Proposal');
      } catch (err) {
        HeartlyDialog.alert('Failed to propose date: ' + err.message, 'Date Proposal');
      }
    });
  },

  async loadDates() {
    try {
      const data = await API.getDates();
      this.dates = data.dates || [];
      this.render();
    } catch (err) {
      console.error('Failed to load dates:', err);
    }
  },

  render() {
    this.renderCalendar();
    this.renderPendingRequests();
    this.renderUpcomingDates();
  },

  renderCalendar() {
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    document.getElementById('calMonthYearLabel').innerText = `${monthNames[this.currentMonth]} ${this.currentYear}`;

    const grid = document.getElementById('calDaysGrid');
    if (!grid) return;
    grid.innerHTML = '';

    const firstDayIndex = new Date(this.currentYear, this.currentMonth, 1).getDay();
    const totalDays = new Date(this.currentYear, this.currentMonth + 1, 0).getDate();

    const today = new Date();
    const isCurrentMonth = today.getFullYear() === this.currentYear && today.getMonth() === this.currentMonth;

    // Blank cells before the 1st
    for (let i = 0; i < firstDayIndex; i++) {
      grid.insertAdjacentHTML('beforeend', '<div class="cal-cell" style="opacity:0.3;"></div>');
    }

    // Days of the month
    for (let day = 1; day <= totalDays; day++) {
      const cellDateStr = `${this.currentYear}-${String(this.currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      
      // Check if this date has any accepted date plans
      const hasAcceptedDate = this.dates.some((d) => {
        if (d.status !== 'accepted') return false;
        const dStr = new Date(d.date).toISOString().split('T')[0];
        return dStr === cellDateStr;
      });

      const isToday = isCurrentMonth && today.getDate() === day;

      const cell = document.createElement('div');
      cell.className = `cal-cell ${isToday ? 'today' : ''} ${hasAcceptedDate ? 'has-date' : ''}`;
      cell.innerText = day;
      cell.title = hasAcceptedDate ? 'You have a planned date on this day! ❤️' : '';
      grid.appendChild(cell);
    }
  },

  getCurrentUser() {
    if (window.App?.currentUser) return window.App.currentUser;
    const token = window.API?.getToken?.();
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return {
          id: payload.userId,
          _id: payload.userId,
          name: payload.name,
          email: payload.email,
        };
      } catch (e) {}
    }
    return null;
  },

  renderPendingRequests() {
    const container = document.getElementById('pendingDateRequestsContainer');
    if (!container) return;

    const user = this.getCurrentUser();
    const currentUserId = String(user?.id || user?._id || '').trim();
    const currentUserName = String(user?.name || '').trim().toLowerCase();

    // Robust check whether a date proposal was created by the currently logged-in user
    const isSentByMe = (d) => {
      const senderId = String(d.senderId || '').trim();
      const senderName = String(d.senderName || '').trim().toLowerCase();
      if (currentUserId && senderId && senderId === currentUserId) return true;
      if (currentUserName && senderName && senderName === currentUserName) return true;
      return false;
    };

    // Pending requests sent TO me by partner (Only the recipient can Accept or Decline)
    const incomingRequests = this.dates.filter(
      (d) => d.status === 'pending' && !isSentByMe(d)
    );

    // Pending requests sent BY me (Waiting for partner; sender sees Cancel Request)
    const outgoingRequests = this.dates.filter(
      (d) => d.status === 'pending' && isSentByMe(d)
    );

    if (incomingRequests.length === 0 && outgoingRequests.length === 0) {
      container.innerHTML = '';
      return;
    }

    let html = '';

    // 1. Incoming requests: ONLY the other user sees the Accept and Decline buttons
    incomingRequests.forEach((req) => {
      const formattedDate = new Date(req.date).toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric'
      });

      html += `
        <div class="pending-request-banner" id="date-req-${req._id}">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:12px;">
            <div>
              <span style="font-size:11px; font-weight:800; color:var(--primary); text-transform:uppercase;">💌 Date Invitation from ${this.escapeHtml(req.senderName)}</span>
              <h4 style="font-size:17px; margin:4px 0; color:var(--text-main);">${this.escapeHtml(req.title)}</h4>
              <p style="font-size:13px; color:var(--text-muted);">
                📅 ${formattedDate} at ⏰ ${this.escapeHtml(req.time)}
                ${req.location ? `• 📍 ${this.escapeHtml(req.location)}` : ''}
              </p>
              ${req.notes ? `<p style="font-size:12px; margin-top:6px; font-style:italic; color:#555;">"${this.escapeHtml(req.notes)}"</p>` : ''}
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              <button class="btn-accept" onclick="DatesManager.respondToDate('${req._id}', 'accepted')">❤️ Accept Date</button>
              <button class="btn-decline" onclick="DatesManager.respondToDate('${req._id}', 'declined')">Decline</button>
            </div>
          </div>
        </div>
      `;
    });

    // 2. Outgoing requests: Sender sees "Waiting for partner to accept", with quick option to cancel/delete
    outgoingRequests.forEach((req) => {
      const formattedDate = new Date(req.date).toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric'
      });

      html += `
        <div class="pending-outgoing-banner" id="date-req-${req._id}">
          <div>
            <div style="display:flex; align-items:center; gap:6px;">
              <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#f39c12; box-shadow: 0 0 6px rgba(243, 156, 18, 0.6);"></span>
              <span style="font-size:11px; font-weight:800; color:#856404; text-transform:uppercase; letter-spacing:0.5px;">⏳ Invitation Sent • Waiting for Partner</span>
            </div>
            <div style="font-size:15px; font-weight:800; color:var(--text-main); margin-top:4px;">${this.escapeHtml(req.title)}</div>
            <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">
              📅 ${formattedDate} at ⏰ ${this.escapeHtml(req.time)} ${req.location ? `• 📍 ${this.escapeHtml(req.location)}` : ''}
            </div>
          </div>
          <button type="button" class="btn-cancel-request" onclick="DatesManager.deleteDatePlan('${req._id}')" title="Delete/Cancel this proposal before partner responds">
            🗑️ Cancel Request
          </button>
        </div>
      `;
    });

    container.innerHTML = html;
  },

  renderUpcomingDates() {
    const container = document.getElementById('upcomingDatesList');
    if (!container) return;

    const acceptedDates = this.dates
      .filter((d) => d.status === 'accepted')
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    if (acceptedDates.length === 0) {
      container.innerHTML = `
        <div style="text-align:center; padding: 30px; background:white; border-radius:16px; border:1px dashed var(--border);">
          <div style="font-size: 34px; margin-bottom: 6px;">🥂</div>
          <p style="font-size: 14px; color: var(--text-muted);">No accepted dates scheduled yet.</p>
          <button class="btn-secondary" style="max-width:180px; margin: 10px auto 0;" onclick="document.getElementById('btnOpenProposeModal').click()">Propose a Date</button>
        </div>
      `;
      return;
    }

    container.innerHTML = acceptedDates
      .map((d) => {
        const dateObj = new Date(d.date);
        const formattedDate = dateObj.toLocaleDateString('en-US', {
          weekday: 'short', month: 'short', day: 'numeric'
        });

        // Compute countdown
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const target = new Date(d.date);
        target.setHours(0, 0, 0, 0);
        const diffDays = Math.round((target - now) / (1000 * 60 * 60 * 24));

        let badge = '';
        if (diffDays === 0) badge = 'TODAY ❤️';
        else if (diffDays === 1) badge = 'TOMORROW ✨';
        else if (diffDays > 1) badge = `IN ${diffDays} DAYS`;
        else badge = 'PAST MEMORY';

        return `
          <div class="date-card">
            <div>
              <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                <span class="date-countdown-badge">${badge}</span>
                <span style="font-size:12px; color:var(--text-muted);">📅 ${formattedDate} at ${this.escapeHtml(d.time)}</span>
              </div>
              <h4 style="font-size:16px; font-weight:800; color:var(--primary);">${this.escapeHtml(d.title)}</h4>
              ${d.location ? `<p style="font-size:13px; color:var(--text-main); margin-top:3px;">📍 ${this.escapeHtml(d.location)}</p>` : ''}
              ${d.notes ? `<p style="font-size:12px; color:var(--text-muted); margin-top:2px; font-style:italic;">"${this.escapeHtml(d.notes)}"</p>` : ''}
            </div>
            <button style="background:none; border:none; cursor:pointer; color:#aaa; font-size:16px;" title="Remove Date" onclick="DatesManager.deleteDatePlan('${d._id}')">&times;</button>
          </div>
        `;
      })
      .join('');
  },

  async respondToDate(id, action) {
    const user = this.getCurrentUser();
    const currentUserId = String(user?.id || user?._id || '').trim();
    const currentUserName = String(user?.name || '').trim().toLowerCase();
    const datePlan = this.dates.find((d) => String(d._id) === String(id));

    if (datePlan) {
      const senderId = String(datePlan.senderId || '').trim();
      const senderName = String(datePlan.senderName || '').trim().toLowerCase();
      const isSentByMe = (currentUserId && senderId === currentUserId) ||
                         (currentUserName && senderName === currentUserName);
      if (isSentByMe) {
        HeartlyDialog.alert('You proposed this date. Only your partner can accept or decline it! You can cancel or delete it anytime with the "Cancel Request" button.', 'Date Response');
        return;
      }
    }

    try {
      const res = await API.respondDate(id, action);
      const updated = res.datePlan;

      // Update in local list
      const idx = this.dates.findIndex((d) => String(d._id) === String(id));
      if (idx > -1) {
        this.dates[idx] = updated;
      }

      window.SocketManager.emitDateResponded(updated, action, user?.name || 'Partner');

      if (action === 'accepted') {
        window.SocketManager.triggerHeartbeatEffect('Date Locked In! ❤️');
      }

      this.render();
    } catch (err) {
      HeartlyDialog.alert('Error updating date: ' + err.message, 'Date Response');
    }
  },

  async deleteDatePlan(id) {
    const confirmed = await HeartlyDialog.confirm('Cancel this date invitation?', 'Cancel Date');
    if (confirmed) {
      try {
        await API.deleteDate(id);
        this.dates = this.dates.filter((d) => String(d._id) !== String(id));
        window.SocketManager.emitDateDeleted(id);
        this.render();
      } catch (err) {
        HeartlyDialog.alert('Failed to delete date: ' + err.message, 'Cancel Date');
      }
    }
  },

  handleDateDeleted(dateId) {
    this.dates = this.dates.filter((d) => String(d._id) !== String(dateId));
    this.render();
  },

  handleIncomingDateProposal(datePlan) {
    this.dates.push(datePlan);
    this.render();
    window.SocketManager.triggerHeartbeatEffect('New Date Invitation! 💌');
  },

  handleDateResponse(data) {
    const { datePlan, action, responderName } = data;
    const idx = this.dates.findIndex((d) => d._id === datePlan._id);
    if (idx > -1) {
      this.dates[idx] = datePlan;
    } else {
      this.dates.push(datePlan);
    }
    this.render();

    if (action === 'accepted') {
      window.SocketManager.triggerHeartbeatEffect(`${responderName} accepted your date! ❤️`);
      HeartlyDialog.alert(`🎉 Woohoo! ${responderName} accepted your date: "${datePlan.title}" on ${new Date(datePlan.date).toLocaleDateString()}! It is now scheduled on both of your calendars.`, 'Date Accepted!');
    }
  },

  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.innerText = str;
    return div.innerHTML;
  },
};

window.DatesManager = DatesManager;
