const _opensct_api_urls = [
    'https://demo.defectdojo.org/api/v2/engagements/?tags=sct&status=Not Started&o=-created&active=true&limit=1000',
    'https://demo.defectdojo.org/api/v2/engagements/?tags=sct&status=In Progress&o=-created&active=true&limit=1000',
    'https://demo.defectdojo.org/api/v2/engagements/?tags=sct&status=Completed&o=-created&active=true&limit=1000',
    'https://demo.defectdojo.org/api/v2/engagements/?tags=sct&status=On Hold&o=-created&active=true&limit=1000'
];
const _opensct_users_api = 'https://demo.defectdojo.org/api/v2/users/';
const _opensct_dashboard_url = 'https://demo.defectdojo.org/api/key-v2';
const _opensct_page_size = 20;
let _opensct_engagements = [];
let _opensct_users = [];
let _opensct_current_page = 1;
let _opensct_csrf_token = '';
let _opensct_filtered_engagements = [];
let _opensct_current_comment_engagement_id = null;
let _opensct_current_close_engagement_id = null;

async function _opensct_fetchCsrfToken() {
    try {
        const response = await fetch(_opensct_dashboard_url);
        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const tokenInput = doc.querySelector('input[name="csrfmiddlewaretoken"]');
        _opensct_csrf_token = tokenInput ? tokenInput.value : '';
    } catch (error) {
        _opensct_showToast('Error fetching CSRF token', 'error');
    }
}

async function _opensct_fetchUsers() {
    try {
        const response = await fetch(_opensct_users_api);
        const data = await response.json();
        _opensct_users = data.results;
        const filterSelect = document.getElementById('_opensct_assigned_filter');
        _opensct_users.forEach(user => {
            const option = document.createElement('option');
            option.value = user.id;
            option.textContent = `${user.first_name} ${user.last_name}`;
            filterSelect.appendChild(option);
        });
    } catch (error) {
        _opensct_showToast('Error fetching users', 'error');
    }
}

async function _opensct_fetchEngagements() {
    try {
        const responses = await Promise.all(_opensct_api_urls.map(url => fetch(url)));
        const data = await Promise.all(responses.map(res => res.json()));
        _opensct_engagements = data.flatMap(d => d.results).map(engagement => ({
            ...engagement,
            status: engagement.status || 'Not Started',
            branch_tag: engagement.branch_tag || 'Not Started',
            commit_hash: engagement.commit_hash || 'Not Started'
        }));
        _opensct_filtered_engagements = [..._opensct_engagements];
        await _opensct_fetchUsers();
        _opensct_renderCards();
        _opensct_updateTotalCount();
        _opensct_showToast('Engagements loaded successfully', 'success');
    } catch (error) {
        _opensct_showToast('Error fetching engagements', 'error');
    }
}

async function _opensct_fetchJiraCounts(engagementId) {
    try {
        const response = await fetch(`https://demo.defectdojo.org/api/v2/tests/?engagement=${engagementId}&tags=mcr_jira`);
        const data = await response.json();
        const tests = data.results;
        const totalJiras = tests.length;
        const pendingJiras = tests.filter(test => !['Completed', 'Rejected'].includes(test.branch_tag)).length;
        const doableJiras = tests.filter(test => 
            ['Ready for testing', 'done', 'ready for qa'].includes(test.build_id)
        ).length;
        const nonDoableJiras = pendingJiras - doableJiras;
        return { totalJiras, pendingJiras, doableJiras, nonDoableJiras };
    } catch (error) {
        _opensct_showToast('Error fetching Jira counts', 'error');
        return { totalJiras: 0, pendingJiras: 0, doableJiras: 0, nonDoableJiras: 0 };
    }
}

function _opensct_formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function _opensct_getUserName(userId) {
    const user = _opensct_users.find(u => u.id === userId);
    return user ? `${user.first_name} ${user.last_name}` : 'Unknown';
}

function _opensct_showToast(message, type) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 100);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function _opensct_updateTotalCount() {
    const countElement = document.getElementById('_opensct_total_count');
    countElement.textContent = `Total Engagements: ${_opensct_filtered_engagements.length}`;
}

function _opensct_renderCards() {
    const container = document.getElementById('_opensct_card_container');
    container.innerHTML = '';
    const start = (_opensct_current_page - 1) * _opensct_page_size;
    const end = start + _opensct_page_size;
    const paginatedEngagements = _opensct_filtered_engagements.slice(start, end);

    paginatedEngagements.forEach(engagement => {
        const card = document.createElement('div');
        card.className = 'card';
        card.id = `_opensct_card_${engagement.id}`;
        card.innerHTML = `
            <div>${_opensct_formatDate(engagement.created)}</div>
            <div>${engagement.id}</div>
            <div>${engagement.name}</div>
            <div id="_opensct_total_jiras_${engagement.id}">Loading...</div>
            <div id="_opensct_pending_jiras_${engagement.id}">Loading...</div>
            <div id="_opensct_doable_jiras_${engagement.id}">Loading...</div>
            <div id="_opensct_non_doable_jiras_${engagement.id}">Loading...</div>
            <div>
                <select id="_opensct_analyst_${engagement.id}" onchange="_opensct_updateStatus(${engagement.id}, 'analyst', this.value)">
                    <option value="Not Started" ${engagement.status === 'Not Started' ? 'selected' : ''}>Not Started</option>
                    <option value="In Progress" ${engagement.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
                    <option value="On Hold" ${engagement.status === 'On Hold' ? 'selected' : ''}>On Hold</option>
                    <option value="Completed" ${engagement.status === 'Completed' ? 'selected' : ''}>Completed</option>
                </select>
            </div>
            <div>
                <select id="_opensct_mentor_${engagement.id}" onchange="_opensct_updateStatus(${engagement.id}, 'mentor', this.value)">
                    <option value="Not Started" ${engagement.branch_tag === 'Not Started' ? 'selected' : ''}>Not Started</option>
                    <option value="In Progress" ${engagement.branch_tag === 'In Progress' ? 'selected' : ''}>In Progress</option>
                    <option value="On Hold" ${engagement.branch_tag === 'On Hold' ? 'selected' : ''}>On Hold</option>
                    <option value="Completed" ${engagement.branch_tag === 'Completed' ? 'selected' : ''}>Completed</option>
                </select>
            </div>
            <div>
                <select id="_opensct_lead_status_${engagement.id}" onchange="_opensct_updateStatus(${engagement.id}, 'lead', this.value)">
                    <option value="Not Started" ${engagement.commit_hash === 'Not Started' ? 'selected' : ''}>Not Started</option>
                    <option value="Approved" ${engagement.commit_hash === 'Approved' ? 'selected' : ''}>Approved</option>
                    <option value="Not Approved" ${engagement.commit_hash === 'Not Approved' ? 'selected' : ''}>Not Approved</option>
                    <option value="Rejected" ${engagement.commit_hash === 'Rejected' ? 'selected' : ''}>Rejected</option>
                </select>
            </div>
            <div>
                <select id="_opensct_lead_${engagement.id}" onchange="_opensct_updateLead(${engagement.id}, this.value)">
                    <option value="">Select User</option>
                    ${_opensct_users.map(user => `<option value="${user.id}" ${engagement.lead === user.id ? 'selected' : ''}>${user.first_name} ${user.last_name}</option>`).join('')}
                </select>
            </div>
            <div>
                <input type="text" class="ir-input" id="_opensct_ir_${engagement.id}" value="${engagement.version || ''}" onblur="_opensct_updateIR(${engagement.id}, this.value)" onkeydown="if(event.key === 'Enter') _opensct_updateIR(${engagement.id}, this.value)">
            </div>
            <div>
                <input type="text" class="eta-input" id="_opensct_eta_${engagement.id}" value="${_opensct_formatDate(engagement.target_end)}" readonly>
            </div>
            <div class="action-buttons">
                <button class="close-btn" onclick="_opensct_openCloseModal(${engagement.id})">Close</button>
                <button class="comment-btn ${engagement.description ? 'red' : ''}" onclick="_opensct_openCommentModal(${engagement.id})">Comment</button>
            </div>
        `;
        container.appendChild(card);

        // Initialize searchable dropdown for Assigned To
        $(`#_opensct_lead_${engagement.id}`).selectmenu({
            width: '100%',
            change: function(event, ui) {
                _opensct_updateLead(engagement.id, ui.item.value);
            }
        });

        // Initialize datepicker for ETA
        $(`#_opensct_eta_${engagement.id}`).datepicker({
            dateFormat: 'dd/mm/yy',
            onSelect: function(dateText) {
                _opensct_updateETA(engagement.id, dateText);
            }
        });
        
        _opensct_fetchJiraCounts(engagement.id).then(counts => {
            document.getElementById(`_opensct_total_jiras_${engagement.id}`).textContent = counts.totalJiras;
            document.getElementById(`_opensct_pending_jiras_${engagement.id}`).textContent = counts.pendingJiras;
            document.getElementById(`_opensct_doable_jiras_${engagement.id}`).textContent = counts.doableJiras;
            document.getElementById(`_opensct_non_doable_jiras_${engagement.id}`).textContent = counts.nonDoableJiras;
        });
    });

    _opensct_renderPagination(_opensct_filtered_engagements.length);
}

function _opensct_updateCard(engagement) {
    const card = document.getElementById(`_opensct_card_${engagement.id}`);
    if (!card) return;

    _opensct_fetchJiraCounts(engagement.id).then(counts => {
        document.getElementById(`_opensct_total_jiras_${engagement.id}`).textContent = counts.totalJiras;
        document.getElementById(`_opensct_pending_jiras_${engagement.id}`).textContent = counts.pendingJiras;
        document.getElementById(`_opensct_doable_jiras_${engagement.id}`).textContent = counts.doableJiras;
        document.getElementById(`_opensct_non_doable_jiras_${engagement.id}`).textContent = counts.nonDoableJiras;
    });

    card.children[0].textContent = _opensct_formatDate(engagement.created);
    card.children[1].textContent = engagement.id;
    card.children[2].textContent = engagement.name;
    card.children[7].querySelector('select').value = engagement.status || 'Not Started';
    card.children[8].querySelector('select').value = engagement.branch_tag || 'Not Started';
    card.children[9].querySelector('select').value = engagement.commit_hash || 'Not Started';
    card.children[10].querySelector('select').value = engagement.lead || '';
    card.children[11].querySelector('input').value = engagement.version || '';
    card.children[12].querySelector('input').value = _opensct_formatDate(engagement.target_end);
    const commentBtn = card.querySelector('.comment-btn');
    commentBtn.className = `comment-btn ${engagement.description ? 'red' : ''}`;
}

function _opensct_renderPagination(totalItems) {
    const totalPages = Math.ceil(totalItems / _opensct_page_size);
    const pagination = document.getElementById('_opensct_pagination');
    pagination.innerHTML = `
        <button onclick="_opensct_changePage(${_opensct_current_page - 1})" ${_opensct_current_page === 1 ? 'disabled' : ''}>Previous</button>
        <span>Page ${_opensct_current_page} of ${totalPages}</span>
        <button onclick="_opensct_changePage(${_opensct_current_page + 1})" ${_opensct_current_page === totalPages ? 'disabled' : ''}>Next</button>
    `;
}

function _opensct_changePage(page) {
    _opensct_current_page = page;
    _opensct_renderCards();
}

function _opensct_filterTable() {
    const searchInput = document.getElementById('_opensct_search_input').value.toLowerCase();
    const assignedFilter = document.getElementById('_opensct_assigned_filter').value;
    const etaFilter = document.getElementById('_opensct_eta_filter').value;

    _opensct_filtered_engagements = _opensct_engagements.filter(engagement => {
        const matchesSearch = engagement.name.toLowerCase().includes(searchInput);
        const matchesAssigned = !assignedFilter || engagement.lead === parseInt(assignedFilter);
        const matchesEta = !etaFilter || engagement.target_end.includes(etaFilter);
        return matchesSearch && matchesAssigned && matchesEta;
    });

    _opensct_current_page = 1;
    _opensct_renderCards();
    _opensct_updateTotalCount();
    _opensct_showToast('Filters applied', 'success');
}

function _opensct_clearFilters() {
    document.getElementById('_opensct_search_input').value = '';
    document.getElementById('_opensct_assigned_filter').value = '';
    document.getElementById('_opensct_eta_filter').value = '';
    _opensct_filtered_engagements = [..._opensct_engagements];
    _opensct_current_page = 1;
    _opensct_renderCards();
    _opensct_updateTotalCount();
    _opensct_showToast('Filters cleared', 'success');
}

async function _opensct_updateStatus(engagementId, type, value) {
    const engagement = _opensct_engagements.find(e => e.id === engagementId);
    if (!engagement) {
        _opensct_showToast('Engagement not found', 'error');
        return;
    }

    if (type === 'analyst') engagement.status = value;
    else if (type === 'mentor') engagement.branch_tag = value;
    else if (type === 'lead') engagement.commit_hash = value;

    const updatedEngagement = {
        id: engagement.id,
        name: engagement.name,
        target_start: engagement.target_start,
        target_end: engagement.target_end,
        lead: engagement.lead,
        product: engagement.product,
        status: engagement.status,
        branch_tag: engagement.branch_tag,
        commit_hash: engagement.commit_hash,
        description: engagement.description
    };

    try {
        const response = await fetch(`https://demo.defectdojo.org/api/v2/engagements/${engagementId}/`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': _opensct_csrf_token
            },
            body: JSON.stringify(updatedEngagement)
        });
        if (response.ok) {
            _opensct_updateCard(engagement);
            _opensct_showToast(`${engagement.name} ${type} status updated`, 'success');
        } else {
            _opensct_showToast(`Failed to update ${type} status`, 'error');
        }
    } catch (error) {
        _opensct_showToast(`Error updating ${type} status`, 'error');
    }
}

async function _opensct_updateLead(engagementId, userId) {
    const engagement = _opensct_engagements.find(e => e.id === engagementId);
    if (!engagement) {
        _opensct_showToast('Engagement not found', 'error');
        return;
    }

    engagement.lead = userId ? parseInt(userId) : null;
    const updatedEngagement = {
        id: engagement.id,
        name: engagement.name,
        target_start: engagement.target_start,
        target_end: engagement.target_end,
        lead: engagement.lead,
        product: engagement.product,
        status: engagement.status,
        branch_tag: engagement.branch_tag,
        commit_hash: engagement.commit_hash,
        description: engagement.description
    };

    try {
        const response = await fetch(`https://demo.defectdojo.org/api/v2/engagements/${engagementId}/`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': _opensct_csrf_token
            },
            body: JSON.stringify(updatedEngagement)
        });
        if (response.ok) {
            _opensct_updateCard(engagement);
            _opensct_showToast(`${engagement.name} lead updated`, 'success');
        } else {
            _opensct_showToast('Failed to update lead', 'error');
        }
    } catch (error) {
        _opensct_showToast('Error updating lead', 'error');
    }
}

async function _opensct_updateIR(engagementId, value) {
    const engagement = _opensct_engagements.find(e => e.id === engagementId);
    if (!engagement) {
        _opensct_showToast('Engagement not found', 'error');
        return;
    }

    engagement.version = value || null;
    const updatedEngagement = {
        id: engagement.id,
        name: engagement.name,
        target_start: engagement.target_start,
        target_end: engagement.target_end,
        lead: engagement.lead,
        product: engagement.product,
        status: engagement.status,
        branch_tag: engagement.branch_tag,
        commit_hash: engagement.commit_hash,
        description: engagement.description,
        version: engagement.version
    };

    try {
        const response = await fetch(`https://demo.defectdojo.org/api/v2/engagements/${engagementId}/`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': _opensct_csrf_token
            },
            body: JSON.stringify(updatedEngagement)
        });
        if (response.ok) {
            _opensct_updateCard(engagement);
            _opensct_showToast(`${engagement.name} IR updated`, 'success');
        } else {
            _opensct_showToast('Failed to update IR', 'error');
        }
    } catch (error) {
        _opensct_showToast('Error updating IR', 'error');
    }
}

async function _opensct_updateETA(engagementId, dateText) {
    const engagement = _opensct_engagements.find(e => e.id === engagementId);
    if (!engagement) {
        _opensct_showToast('Engagement not found', 'error');
        return;
    }

    const [day, month, year] = dateText.split('/');
    engagement.target_end = `${year}-${month}-${day}`;
    const updatedEngagement = {
        id: engagement.id,
        name: engagement.name,
        target_start: engagement.target_start,
        target_end: engagement.target_end,
        lead: engagement.lead,
        product: engagement.product,
        status: engagement.status,
        branch_tag: engagement.branch_tag,
        commit_hash: engagement.commit_hash,
        description: engagement.description,
        version: engagement.version
    };

    try {
        const response = await fetch(`https://demo.defectdojo.org/api/v2/engagements/${engagementId}/`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': _opensct_csrf_token
            },
            body: JSON.stringify(updatedEngagement)
        });
        if (response.ok) {
            _opensct_updateCard(engagement);
            _opensct_showToast(`${engagement.name} ETA updated`, 'success');
        } else {
            _opensct_showToast('Failed to update ETA', 'error');
        }
    } catch (error) {
        _opensct_showToast('Error updating ETA', 'error');
    }
}

async function _opensct_closeEngagement(engagementId) {
    const engagement = _opensct_engagements.find(e => e.id === engagementId);
    if (!engagement) {
        _opensct_showToast('Engagement not found', 'error');
        return;
    }

    try {
        const response = await fetch(`https://demo.defectdojo.org/api/v2/engagements/${engagementId}/close/`, {
            method: 'POST',
            headers: {
                'X-CSRFToken': _opensct_csrf_token
            }
        });
        if (response.ok) {
            _opensct_engagements = _opensct_engagements.filter(e => e.id !== engagementId);
            _opensct_filtered_engagements = _opensct_filtered_engagements.filter(e => e.id !== engagementId);
            const card = document.getElementById(`_opensct_card_${engagementId}`);
            if (card) card.remove();
            _opensct_renderPagination(_opensct_filtered_engagements.length);
            _opensct_updateTotalCount();
            _opensct_showToast(`${engagement.name} closed`, 'success');
        } else {
            _opensct_showToast('Failed to close engagement', 'error');
        }
    } catch (error) {
        _opensct_showToast('Error closing engagement', 'error');
    }
}

function _opensct_openCommentModal(engagementId) {
    const engagement = _opensct_engagements.find(e => e.id === engagementId);
    if (!engagement) {
        _opensct_showToast('Engagement not found', 'error');
        return;
    }

    _opensct_current_comment_engagement_id = engagementId;
    const textarea = document.getElementById('_opensct_comment_textarea');
    textarea.value = engagement.description || '';
    document.getElementById('_opensct_comment_modal').style.display = 'flex';
}

function _opensct_closeCommentModal() {
    document.getElementById('_opensct_comment_modal').style.display = 'none';
    _opensct_current_comment_engagement_id = null;
    _opensct_showToast('Comment cancelled', 'warning');
}

async function _opensct_saveCommentFromModal() {
    const engagementId = _opensct_current_comment_engagement_id;
    const engagement = _opensct_engagements.find(e => e.id === engagementId);
    if (!engagement) {
        _opensct_showToast('Engagement not found', 'error');
        return;
    }

    const textarea = document.getElementById('_opensct_comment_textarea');
    engagement.description = textarea.value;

    const updatedEngagement = {
        id: engagement.id,
        name: engagement.name,
        target_start: engagement.target_start,
        target_end: engagement.target_end,
        lead: engagement.lead,
        product: engagement.product,
        status: engagement.status,
        branch_tag: engagement.branch_tag,
        commit_hash: engagement.commit_hash,
        description: engagement.description,
        version: engagement.version
    };

    try {
        const response = await fetch(`https://demo.defectdojo.org/api/v2/engagements/${engagementId}/`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': _opensct_csrf_token
            },
            body: JSON.stringify(updatedEngagement)
        });
        if (response.ok) {
            _opensct_updateCard(engagement);
            document.getElementById('_opensct_comment_modal').style.display = 'none';
            _opensct_current_comment_engagement_id = null;
            _opensct_showToast(`${engagement.name} comment updated`, 'success');
        } else {
            _opensct_showToast('Failed to save comment', 'error');
        }
    } catch (error) {
        _opensct_showToast('Error saving comment', 'error');
    }
}

function _opensct_openCloseModal(engagementId) {
    const engagement = _opensct_engagements.find(e => e.id === engagementId);
    if (!engagement) {
        _opensct_showToast('Engagement not found', 'error');
        return;
    }

    _opensct_current_close_engagement_id = engagementId;
    const message = document.getElementById('_opensct_close_message');
    message.textContent = `Are you sure you want to close ${engagement.name}?`;
    document.getElementById('_opensct_close_modal').style.display = 'flex';
}

function _opensct_closeCloseModal() {
    document.getElementById('_opensct_close_modal').style.display = 'none';
    _opensct_current_close_engagement_id = null;
    _opensct_showToast('Close action cancelled', 'warning');
}

function _opensct_confirmClose() {
    const engagementId = _opensct_current_close_engagement_id;
    if (!engagementId) return;

    _opensct_closeEngagement(engagementId);
    document.getElementById('_opensct_close_modal').style.display = 'none';
    _opensct_current_close_engagement_id = null;
}

function _opensct_filterTable() {
    const searchInput = document.getElementById('_opensct_search_input').value.toLowerCase();
    const assignedFilter = document.getElementById('_opensct_assigned_filter').value;
    const etaFilter = document.getElementById('_opensct_eta_filter').value;

    _opensct_filtered_engagements = _opensct_engagements.filter(engagement => {
        const matchesSearch = engagement.name.toLowerCase().includes(searchInput);
        const matchesAssigned = !assignedFilter || engagement.lead === parseInt(assignedFilter);
        const matchesEta = !etaFilter || engagement.target_end.includes(etaFilter);
        return matchesSearch && matchesAssigned && matchesEta;
    });

    _opensct_current_page = 1;
    _opensct_renderCards();
    _opensct_updateTotalCount();
    _opensct_showToast('Filters applied', 'success');
}

function _opensct_clearFilters() {
    document.getElementById('_opensct_search_input').value = '';
    document.getElementById('_opensct_assigned_filter').value = '';
    document.getElementById('_opensct_eta_filter').value = '';
    _opensct_filtered_engagements = [..._opensct_engagements];
    _opensct_current_page = 1;
    _opensct_renderCards();
    _opensct_updateTotalCount();
    _opensct_showToast('Filters cleared', 'success');
}

document.addEventListener('DOMContentLoaded', () => {
    _opensct_fetchCsrfToken().then(_opensct_fetchEngagements);

    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(tab.dataset.tab).classList.add('active');
        });
    });
});