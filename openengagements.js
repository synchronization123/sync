const _open_engagements_api_urls = {
    engagements: 'https://demo.defectdojo.org/api/v2/engagements/?tags=sct',
    tests: 'https://demo.defectdojo.org/api/v2/tests/'
};

function _open_engagements_showToast(message, type) {
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

async function _open_engagements_fetchEngagements() {
    document.getElementById('_open_engagements_loading_modal').style.display = 'flex';
    try {
        const response = await fetch(_open_engagements_api_urls.engagements);
        const data = await response.json();
        const validEngagements = (data.results || []).filter(engagement => 
            engagement.active === true && 
            ['Not Started', 'In Progress', 'On Hold'].includes(engagement.status)
        );
        await _open_engagements_populateTable(validEngagements);
    } catch (error) {
        _open_engagements_showToast('Error fetching engagements: ' + error.message, 'error');
    } finally {
        document.getElementById('_open_engagements_loading_modal').style.display = 'none';
    }
}

async function _open_engagements_fetchTests(engagementId, status) {
    try {
        const response = await fetch(`${_open_engagements_api_urls.tests}?engagement=${engagementId}&tags=mcr_jira`);
        const data = await response.json();
        const tests = data.results || [];
        // Categorize tests based on branch_tag into Pending, Completed, On Hold, Rejected
        const buildStatus = tests.reduce((acc, test) => {
            const buildId = test.branch_tag || 'Pending'; // Default to Pending if no branch_tag
            if (buildId === 'Pending') {
                acc.Pending = (acc.Pending || 0) + 1;
            } else if (buildId === 'Completed') {
                acc.Completed = (acc.Completed || 0) + 1;
            } else if (buildId === 'On Hold') {
                acc.OnHold = (acc.OnHold || 0) + 1;
            } else if (buildId === 'Rejected') {
                acc.Rejected = (acc.Rejected || 0) + 1;
            } else {
                acc.Pending = (acc.Pending || 0) + 1; // Default to Pending for unknown statuses
            }
            return acc;
        }, { Pending: 0, Completed: 0, OnHold: 0, Rejected: 0 });
        return {
            total: tests.length,
            ...buildStatus
        };
    } catch (error) {
        _open_engagements_showToast('Error fetching tests for engagement ' + engagementId + ': ' + error.message, 'error');
        return { total: 0, Pending: 0, Completed: 0, OnHold: 0, Rejected: 0 };
    }
}

async function _open_engagements_populateTable(engagements) {
    const tbody = document.querySelector('#_open_engagements_table tbody');
    tbody.innerHTML = '';
    const leadCounts = {};

    // Group engagements by lead and fetch test counts per status
    for (const engagement of engagements) {
        const leadId = engagement.lead;
        if (!leadCounts[leadId]) {
            leadCounts[leadId] = {
                notStarted: 0,
                inProgress: 0,
                onHold: 0,
                jiraCounts: { 
                    notStarted: { total: 0, Pending: 0, Completed: 0, OnHold: 0, Rejected: 0 }, 
                    inProgress: { total: 0, Pending: 0, Completed: 0, OnHold: 0, Rejected: 0 }, 
                    onHold: { total: 0, Pending: 0, Completed: 0, OnHold: 0, Rejected: 0 } 
                }
            };
        }
        const testCounts = await _open_engagements_fetchTests(engagement.id, engagement.status);
        if (engagement.status === 'Not Started') {
            leadCounts[leadId].notStarted++;
            leadCounts[leadId].jiraCounts.notStarted = testCounts;
        }
        if (engagement.status === 'In Progress') {
            leadCounts[leadId].inProgress++;
            leadCounts[leadId].jiraCounts.inProgress = testCounts;
        }
        if (engagement.status === 'On Hold') {
            leadCounts[leadId].onHold++;
            leadCounts[leadId].jiraCounts.onHold = testCounts;
        }
    }

    // Populate table rows
    for (const leadId in leadCounts) {
        const lead = _open_engagements_getLeadName(leadId);
        const { notStarted, inProgress, onHold, jiraCounts } = leadCounts[leadId];
        const total = notStarted + inProgress + onHold;
        const totalJira = jiraCounts.notStarted.total + jiraCounts.inProgress.total + jiraCounts.onHold.total;
        const totalPending = jiraCounts.notStarted.Pending + jiraCounts.inProgress.Pending + jiraCounts.onHold.Pending;
        const totalCompleted = jiraCounts.notStarted.Completed + jiraCounts.inProgress.Completed + jiraCounts.onHold.Completed;
        const totalOnHoldBuild = jiraCounts.notStarted.OnHold + jiraCounts.inProgress.OnHold + jiraCounts.onHold.OnHold;
        const totalRejected = jiraCounts.notStarted.Rejected + jiraCounts.inProgress.Rejected + jiraCounts.onHold.Rejected;

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${lead || 'Unassigned'}</td>
            <td>${notStarted}${notStarted > 0 && jiraCounts.notStarted.total > 0 ? `<br><span class="jira-count">Jira: ${jiraCounts.notStarted.total} {Pending: ${jiraCounts.notStarted.Pending}, Completed: ${jiraCounts.notStarted.Completed}, On Hold: ${jiraCounts.notStarted.OnHold}, Rejected: ${jiraCounts.notStarted.Rejected}}</span>` : ''}</td>
            <td>${inProgress}${inProgress > 0 && jiraCounts.inProgress.total > 0 ? `<br><span class="jira-count">Jira: ${jiraCounts.inProgress.total} {Pending: ${jiraCounts.inProgress.Pending}, Completed: ${jiraCounts.inProgress.Completed}, On Hold: ${jiraCounts.inProgress.OnHold}, Rejected: ${jiraCounts.inProgress.Rejected}}</span>` : ''}</td>
            <td>${onHold}${onHold > 0 && jiraCounts.onHold.total > 0 ? `<br><span class="jira-count">Jira: ${jiraCounts.onHold.total} {Pending: ${jiraCounts.onHold.Pending}, Completed: ${jiraCounts.onHold.Completed}, On Hold: ${jiraCounts.onHold.OnHold}, Rejected: ${jiraCounts.onHold.Rejected}}</span>` : ''}</td>
            <td>${total}${totalJira > 0 ? `<br><span class="jira-count">Jira: ${totalJira} {Pending: ${totalPending}, Completed: ${totalCompleted}, On Hold: ${totalOnHoldBuild}, Rejected: ${totalRejected}}</span>` : ''}</td>
        `;
        tbody.appendChild(row);
    }

    // Add total row
    const totalRow = document.createElement('tr');
    totalRow.className = 'total-row';
    const totalNotStarted = Object.values(leadCounts).reduce((sum, count) => sum + count.notStarted, 0);
    const totalInProgress = Object.values(leadCounts).reduce((sum, count) => sum + count.inProgress, 0);
    const totalOnHold = Object.values(leadCounts).reduce((sum, count) => sum + count.onHold, 0);
    const totalEngagements = totalNotStarted + totalInProgress + totalOnHold;
    const totalJiraNotStarted = Object.values(leadCounts).reduce((sum, count) => sum + count.jiraCounts.notStarted.total, 0);
    const totalJiraInProgress = Object.values(leadCounts).reduce((sum, count) => sum + count.jiraCounts.inProgress.total, 0);
    const totalJiraOnHold = Object.values(leadCounts).reduce((sum, count) => sum + count.jiraCounts.onHold.total, 0);
    const totalJira = totalJiraNotStarted + totalJiraInProgress + totalJiraOnHold;
    const totalPending = Object.values(leadCounts).reduce((sum, count) => sum + count.jiraCounts.notStarted.Pending + count.jiraCounts.inProgress.Pending + count.jiraCounts.onHold.Pending, 0);
    const totalCompleted = Object.values(leadCounts).reduce((sum, count) => sum + count.jiraCounts.notStarted.Completed + count.jiraCounts.inProgress.Completed + count.jiraCounts.onHold.Completed, 0);
    const totalOnHoldBuild = Object.values(leadCounts).reduce((sum, count) => sum + count.jiraCounts.notStarted.OnHold + count.jiraCounts.inProgress.OnHold + count.jiraCounts.onHold.OnHold, 0);
    const totalRejected = Object.values(leadCounts).reduce((sum, count) => sum + count.jiraCounts.notStarted.Rejected + count.jiraCounts.inProgress.Rejected + count.jiraCounts.onHold.Rejected, 0);

    totalRow.innerHTML = `
        <td><strong>Total</strong></td>
        <td><strong>${totalNotStarted}</strong>${totalNotStarted > 0 && totalJiraNotStarted > 0 ? `<br><span class="jira-count">Jira: ${totalJiraNotStarted} {Pending: ${Object.values(leadCounts).reduce((sum, count) => sum + count.jiraCounts.notStarted.Pending, 0)}, Completed: ${Object.values(leadCounts).reduce((sum, count) => sum + count.jiraCounts.notStarted.Completed, 0)}, On Hold: ${Object.values(leadCounts).reduce((sum, count) => sum + count.jiraCounts.notStarted.OnHold, 0)}, Rejected: ${Object.values(leadCounts).reduce((sum, count) => sum + count.jiraCounts.notStarted.Rejected, 0)}}</span>` : ''}</td>
        <td><strong>${totalInProgress}</strong>${totalInProgress > 0 && totalJiraInProgress > 0 ? `<br><span class="jira-count">Jira: ${totalJiraInProgress} {Pending: ${Object.values(leadCounts).reduce((sum, count) => sum + count.jiraCounts.inProgress.Pending, 0)}, Completed: ${Object.values(leadCounts).reduce((sum, count) => sum + count.jiraCounts.inProgress.Completed, 0)}, On Hold: ${Object.values(leadCounts).reduce((sum, count) => sum + count.jiraCounts.inProgress.OnHold, 0)}, Rejected: ${Object.values(leadCounts).reduce((sum, count) => sum + count.jiraCounts.inProgress.Rejected, 0)}}</span>` : ''}</td>
        <td><strong>${totalOnHold}</strong>${totalOnHold > 0 && totalJiraOnHold > 0 ? `<br><span class="jira-count">Jira: ${totalJiraOnHold} {Pending: ${Object.values(leadCounts).reduce((sum, count) => sum + count.jiraCounts.onHold.Pending, 0)}, Completed: ${Object.values(leadCounts).reduce((sum, count) => sum + count.jiraCounts.onHold.Completed, 0)}, On Hold: ${Object.values(leadCounts).reduce((sum, count) => sum + count.jiraCounts.onHold.OnHold, 0)}, Rejected: ${Object.values(leadCounts).reduce((sum, count) => sum + count.jiraCounts.onHold.Rejected, 0)}}</span>` : ''}</td>
        <td><strong>${totalEngagements}</strong>${totalJira > 0 ? `<br><span class="jira-count">Jira: ${totalJira} {Pending: ${totalPending}, Completed: ${totalCompleted}, On Hold: ${totalOnHoldBuild}, Rejected: ${totalRejected}}</span>` : ''}</td>
    `;
    tbody.appendChild(totalRow);
}

function _open_engagements_getLeadName(leadId) {
    // Simulate fetching lead name from users API (replace with actual fetch if needed)
    const lead = _open_engagements_users.find(user => user.id === parseInt(leadId));
    return lead ? `${lead.first_name} ${lead.last_name}` : null;
}

let _open_engagements_users = [];

async function _open_engagements_fetchUsers() {
    try {
        const response = await fetch('https://demo.defectdojo.org/api/v2/users/');
        const data = await response.json();
        _open_engagements_users = data.results || [];
    } catch (error) {
        _open_engagements_showToast('Error fetching users: ' + error.message, 'error');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Wait for CSRF token to be fetched before proceeding
    const checkCsrfToken = setInterval(() => {
        if (typeof window.csrfToken !== 'undefined') {
            clearInterval(checkCsrfToken);
            if (window.csrfToken === null) {
                _open_engagements_showToast('Failed to fetch CSRF token. Some features may not work.', 'error');
            }
            // Fetch users and engagements after CSRF token is available
            _open_engagements_fetchUsers().then(() => _open_engagements_fetchEngagements());
        }
    }, 100);
});