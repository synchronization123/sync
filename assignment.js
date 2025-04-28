const _assignment_api_urls = {
    tests: 'https://demo.defectdojo.org/api/v2/tests/?tags=mcr_jira&limit=10000',
    users: 'https://demo.defectdojo.org/api/v2/users/',
    environments: 'https://demo.defectdojo.org/api/v2/development_environments/'
};

let _assignment_tests = [];
let _assignment_filtered_tests = [];
let _assignment_users = [];
let _assignment_environments = {};
let _assignment_current_page = 1;
const _assignment_page_size = 20;
let _assignment_selected_tests = new Set();
let _assignment_multi_user_page = 1;
const _assignment_user_page_size = 10;

function _assignment_showToast(message, type) {
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

async function _assignment_fetchUsers() {
    try {
        const response = await fetch(_assignment_api_urls.users);
        const data = await response.json();
        _assignment_users = data.results || [];
    } catch (error) {
        _assignment_showToast('Error fetching users: ' + error.message, 'error');
    }
}

async function _assignment_fetchEnvironmentName(envId) {
    if (!envId) return 'N/A';
    if (_assignment_environments[envId]) return _assignment_environments[envId];

    try {
        const response = await fetch(`${_assignment_api_urls.environments}${envId}/`);
        if (!response.ok) throw new Error(`Failed to fetch environment ${envId}: ${response.statusText}`);
        const data = await response.json();
        _assignment_environments[envId] = data.name || 'N/A';
        return _assignment_environments[envId];
    } catch (error) {
        _assignment_showToast(`Error fetching environment ${envId}: ${error.message}`, 'error');
        return 'N/A';
    }
}

async function _assignment_fetchTests() {
    document.getElementById('_assignment_loading_modal').style.display = 'flex';
    try {
        const response = await fetch(_assignment_api_urls.tests);
        const data = await response.json();
        _assignment_tests = (data.results || []).filter(test => 
            test.branch_tag === 'Pending' || test.branch_tag === 'On Hold'
        );

        for (let test of _assignment_tests) {
            if (test.environment) {
                test.environment_name = await _assignment_fetchEnvironmentName(test.environment);
            } else {
                test.environment_name = 'N/A';
            }

            test.test_type_name = test.test_type_name || 'N/A';
            test.scan_type = test.scan_type || 'N/A';
            test.title = test.title || 'Untitled';
            test.target_start = test.target_start || '1970-01-01T00:00:00Z';
            test.target_end = test.target_end || '1970-01-01T00:00:00Z';
            test.test_type = test.test_type || 0;
            test.environment = test.environment || 0;
        }

        _assignment_filtered_tests = [..._assignment_tests];
        _assignment_populateFilters();
        _assignment_renderTable();
        _assignment_renderPagination();
    } catch (error) {
        _assignment_showToast('Error fetching tests: ' + error.message, 'error');
    } finally {
        document.getElementById('_assignment_loading_modal').style.display = 'none';
    }
}

function _assignment_populateFilters() {
    const versions = [...new Set(_assignment_tests.map(test => test.version).filter(v => v))].sort();
    const environments = [...new Set(_assignment_tests.map(test => test.environment_name).filter(e => e && e !== 'N/A'))].sort();
    const branchTags = [...new Set(_assignment_tests.map(test => test.branch_tag).filter(bt => bt))].sort();
    const commitHashes = [...new Set(_assignment_tests.map(test => test.commit_hash).filter(ch => ch))].sort();
    const buildIds = [...new Set(_assignment_tests.map(test => test.build_id).filter(bi => bi))].sort();
    const leads = [...new Set(_assignment_tests.map(test => test.lead).filter(l => l))].map(leadId => {
        const user = _assignment_users.find(u => u.id === leadId);
        return user ? `${user.first_name} ${user.last_name}` : null;
    }).filter(l => l).sort();

    const versionFilter = document.getElementById('_assignment_version_filter');
    const environmentFilter = document.getElementById('_assignment_environment_filter');
    const branchTagFilter = document.getElementById('_assignment_branch_tag_filter');
    const commitHashFilter = document.getElementById('_assignment_commit_hash_filter');
    const buildIdFilter = document.getElementById('_assignment_build_id_filter');
    const leadFilter = document.getElementById('_assignment_lead_filter');

    versionFilter.innerHTML = '<option value="">Filter by Version</option>' + 
        versions.map(v => `<option value="${v}">${v}</option>`).join('');
    environmentFilter.innerHTML = '<option value="">Filter by Type</option>' + 
        environments.map(e => `<option value="${e}">${e}</option>`).join('');
    branchTagFilter.innerHTML = '<option value="">Filter by Analysis Status</option>' + 
        branchTags.map(bt => `<option value="${bt}">${bt}</option>`).join('');
    commitHashFilter.innerHTML = '<option value="">Filter by Issue Type</option>' + 
        commitHashes.map(ch => `<option value="${ch}">${ch}</option>`).join('');
    buildIdFilter.innerHTML = '<option value="">Filter by Jira Status</option>' + 
        buildIds.map(bi => `<option value="${bi}">${bi}</option>`).join('');
    leadFilter.innerHTML = '<option value="">Filter by Assigned To</option>' + 
        leads.map(l => `<option value="${l}">${l}</option>`).join('');

    const singleUserSelect = document.getElementById('_assignment_single_user_select');
    singleUserSelect.innerHTML = '<option value="">Select User</option>' + 
        _assignment_users.map(u => `<option value="${u.id}">${u.first_name} ${u.last_name}</option>`).join('');
}

function _assignment_filterTable() {
    const searchInput = document.getElementById('_assignment_search_input').value.toLowerCase();
    const versionFilter = document.getElementById('_assignment_version_filter').value;
    const environmentFilter = document.getElementById('_assignment_environment_filter').value;
    const branchTagFilter = document.getElementById('_assignment_branch_tag_filter').value;
    const commitHashFilter = document.getElementById('_assignment_commit_hash_filter').value;
    const buildIdFilter = document.getElementById('_assignment_build_id_filter').value;
    const leadFilter = document.getElementById('_assignment_lead_filter').value;

    _assignment_filtered_tests = _assignment_tests.filter(test => {
        const titleMatch = test.title?.toLowerCase().includes(searchInput) || false;
        const versionMatch = !versionFilter || test.version === versionFilter;
        const environmentMatch = !environmentFilter || test.environment_name === environmentFilter;
        const branchTagMatch = !branchTagFilter || test.branch_tag === branchTagFilter;
        const commitHashMatch = !commitHashFilter || test.commit_hash === commitHashFilter;
        const buildIdMatch = !buildIdFilter || test.build_id === buildIdFilter;
        const leadMatch = !leadFilter || (() => {
            const user = _assignment_users.find(u => u.id === test.lead);
            const leadName = user ? `${user.first_name} ${user.last_name}` : '';
            return leadName === leadFilter;
        })();

        return titleMatch && versionMatch && environmentMatch && branchTagMatch && 
               commitHashMatch && buildIdMatch && leadMatch;
    });

    const filteredTestIds = new Set(_assignment_filtered_tests.map(test => test.id.toString()));
    _assignment_selected_tests = new Set([..._assignment_selected_tests].filter(id => filteredTestIds.has(id)));

    _assignment_current_page = 1;
    _assignment_renderTable();
    _assignment_renderPagination();
}

function _assignment_clearFilters() {
    document.getElementById('_assignment_search_input').value = '';
    document.getElementById('_assignment_version_filter').value = '';
    document.getElementById('_assignment_environment_filter').value = '';
    document.getElementById('_assignment_branch_tag_filter').value = '';
    document.getElementById('_assignment_commit_hash_filter').value = '';
    document.getElementById('_assignment_build_id_filter').value = '';
    document.getElementById('_assignment_lead_filter').value = '';
    _assignment_filtered_tests = [..._assignment_tests];
    _assignment_current_page = 1;
    _assignment_selected_tests.clear();
    _assignment_renderTable();
    _assignment_renderPagination();
}

function _assignment_refreshData() {
    _assignment_selected_tests.clear();
    _assignment_fetchTests();
}

function _assignment_renderTable() {
    const cardContainer = document.getElementById('_assignment_card_container');
    cardContainer.innerHTML = '';
    const start = (_assignment_current_page - 1) * _assignment_page_size;
    const end = start + _assignment_page_size;
    const paginatedTests = _assignment_filtered_tests.slice(start, end);

    paginatedTests.forEach(test => {
        const user = _assignment_users.find(u => u.id === test.lead);
        const leadName = user ? `${user.first_name} ${user.last_name}` : 'N/A';
        const isChecked = _assignment_selected_tests.has(test.id.toString()) ? 'checked' : '';
        const card = document.createElement('div');
        card.className = 'card';
        card.dataset.testId = test.id;
        card.innerHTML = `
            <div><input type="checkbox" class="_assignment_test_checkbox" data-test-id="${test.id}" ${isChecked}></div>
            <div>${test.title || 'N/A'}</div>
            <div>${test.version || 'N/A'}</div>
            <div>${test.environment_name || 'N/A'}</div>
            <div>${test.branch_tag || 'N/A'}</div>
            <div>${test.commit_hash || 'N/A'}</div>
            <div>${test.build_id || 'N/A'}</div>
            <div>${leadName}</div>
        `;
        cardContainer.appendChild(card);
    });

    document.getElementById('_assignment_total_count').textContent = 
        `Total Tests: ${_assignment_filtered_tests.length}`;

    const visibleTestIds = paginatedTests.map(test => test.id.toString());
    const allVisibleSelected = visibleTestIds.every(id => _assignment_selected_tests.has(id));
    document.getElementById('_assignment_select_all').checked = visibleTestIds.length > 0 && allVisibleSelected;
}

function _assignment_renderPagination() {
    const pagination = document.getElementById('_assignment_pagination');
    pagination.innerHTML = '';
    const pageCount = Math.ceil(_assignment_filtered_tests.length / _assignment_page_size);

    const prevButton = document.createElement('button');
    prevButton.textContent = 'Previous';
    prevButton.disabled = _assignment_current_page === 1;
    prevButton.onclick = () => {
        if (_assignment_current_page > 1) {
            _assignment_current_page--;
            _assignment_renderTable();
            _assignment_renderPagination();
        }
    };
    pagination.appendChild(prevButton);

    const pageInfo = document.createElement('span');
    pageInfo.textContent = `Page ${_assignment_current_page} of ${pageCount || 1}`;
    pagination.appendChild(pageInfo);

    const nextButton = document.createElement('button');
    nextButton.textContent = 'Next';
    nextButton.disabled = _assignment_current_page === pageCount;
    nextButton.onclick = () => {
        if (_assignment_current_page < pageCount) {
            _assignment_current_page++;
            _assignment_renderTable();
            _assignment_renderPagination();
        }
    };
    pagination.appendChild(nextButton);
}

function _assignment_renderUserPagination() {
    const pagination = document.getElementById('_assignment_user_pagination');
    pagination.innerHTML = '';
    const userCount = _assignment_users.length;
    const pageCount = Math.ceil(userCount / _assignment_user_page_size);

    const prevButton = document.createElement('button');
    prevButton.textContent = 'Previous';
    prevButton.disabled = _assignment_multi_user_page === 1;
    prevButton.onclick = () => {
        if (_assignment_multi_user_page > 1) {
            _assignment_multi_user_page--;
            _assignment_renderMultiUserList();
            _assignment_renderUserPagination();
        }
    };
    pagination.appendChild(prevButton);

    const pageInfo = document.createElement('span');
    pageInfo.textContent = `Page ${_assignment_multi_user_page} of ${pageCount || 1}`;
    pagination.appendChild(pageInfo);

    const nextButton = document.createElement('button');
    nextButton.textContent = 'Next';
    nextButton.disabled = _assignment_multi_user_page === pageCount;
    nextButton.onclick = () => {
        if (_assignment_multi_user_page < pageCount) {
            _assignment_multi_user_page++;
            _assignment_renderMultiUserList();
            _assignment_renderUserPagination();
        }
    };
    pagination.appendChild(nextButton);
}

function _assignment_exportToCSV() {
    if (_assignment_filtered_tests.length === 0) {
        _assignment_showToast('No data to export', 'error');
        return;
    }

    const headers = ['Test Title', 'Version', 'Type', 'Analysis Status', 'Issue Type', 'Jira Status', 'Assigned To'];
    const rows = _assignment_filtered_tests.map(test => {
        const user = _assignment_users.find(u => u.id === test.lead);
        const leadName = user ? `${user.first_name} ${user.last_name}` : 'N/A';
        return [
            `"${(test.title || 'N/A').replace(/"/g, '""')}"`,
            `"${(test.version || 'N/A').replace(/"/g, '""')}"`,
            `"${(test.environment_name || 'N/A').replace(/"/g, '""')}"`,
            `"${(test.branch_tag || 'N/A').replace(/"/g, '""')}"`,
            `"${(test.commit_hash || 'N/A').replace(/"/g, '""')}"`,
            `"${(test.build_id || 'N/A').replace(/"/g, '""')}"`,
            `"${leadName.replace(/"/g, '""')}"`
        ];
    });

    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'assignment_data.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    _assignment_showToast('Data exported to CSV', 'success');
}

function _assignment_openModal() {
    document.getElementById('_assignment_assign_modal').style.display = 'flex';
    document.getElementById('_assignment_multi_user_list').style.display = 'none';
    document.getElementById('_assignment_user_pagination').style.display = 'none';
    document.getElementById('_assignment_multi_count').value = '';
}

function _assignment_closeModal() {
    document.getElementById('_assignment_assign_modal').style.display = 'none';
    _assignment_multi_user_page = 1;
}

function _assignment_renderMultiUserList() {
    const count = parseInt(document.getElementById('_assignment_multi_count').value) || 0;
    if (count <= 0) {
        document.getElementById('_assignment_multi_user_list').style.display = 'none';
        document.getElementById('_assignment_user_pagination').style.display = 'none';
        return;
    }

    const start = (_assignment_multi_user_page - 1) * _assignment_user_page_size;
    const end = start + _assignment_user_page_size;
    const paginatedUsers = _assignment_users.slice(start, end);

    const userList = document.getElementById('_assignment_multi_user_list');
    userList.innerHTML = paginatedUsers.map(user => `
        <label><input type="checkbox" class="_assignment_multi_user_checkbox" data-user-id="${user.id}">
        ${user.first_name} ${user.last_name}</label>
    `).join('');
    userList.style.display = 'block';
    document.getElementById('_assignment_user_pagination').style.display = 'flex';
    _assignment_renderUserPagination();
}

async function _assignment_assign() {
    if (_assignment_selected_tests.size === 0) {
        _assignment_showToast('No tests selected', 'error');
        return;
    }

    const singleUserSelect = document.getElementById('_assignment_single_user_select').value;
    const multiCount = parseInt(document.getElementById('_assignment_multi_count').value) || 0;
    const selectedMultiUsers = Array.from(document.querySelectorAll('._assignment_multi_user_checkbox:checked'))
        .map(cb => cb.dataset.userId);

    if (!singleUserSelect && (!multiCount || selectedMultiUsers.length === 0)) {
        _assignment_showToast('Please select a user or multiple users to assign', 'error');
        return;
    }

    document.getElementById('_assignment_loading_modal').style.display = 'flex';

    const assignPromises = [];
    const selectedTests = Array.from(_assignment_selected_tests).map(id => 
        _assignment_tests.find(t => t.id.toString() === id)
    ).filter(test => test);

    if (singleUserSelect) {
        selectedTests.forEach(test => {
            assignPromises.push(_assignment_updateTestLead(test, singleUserSelect));
        });
    } else if (multiCount && selectedMultiUsers.length > 0) {
        let userIndex = 0;
        selectedTests.forEach(test => {
            const userId = selectedMultiUsers[userIndex % selectedMultiUsers.length];
            assignPromises.push(_assignment_updateTestLead(test, userId));
            userIndex++;
        });
    }

    try {
        await Promise.all(assignPromises);
        _assignment_showToast('Tests reassigned successfully', 'success');
        _assignment_selected_tests.clear();
        _assignment_fetchTests();
        _assignment_closeModal();
    } catch (error) {
        _assignment_showToast('Error reassigning tests: ' + error.message, 'error');
    } finally {
        document.getElementById('_assignment_loading_modal').style.display = 'none';
    }
}

async function _assignment_updateTestLead(test, leadId) {
    try {
        if (!window.csrfToken) {
            throw new Error('CSRF token is not available');
        }

        const updatedData = {
            id: test.id,
            test_type_name: test.test_type_name,
            scan_type: test.scan_type,
            title: test.title,
            target_start: test.target_start,
            target_end: test.target_end,
            lead: parseInt(leadId),
            test_type: test.test_type,
            environment: test.environment
        };

        const updateResponse = await fetch(`https://demo.defectdojo.org/api/v2/tests/${test.id}/`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': window.csrfToken
            },
            body: JSON.stringify(updatedData)
        });
        if (!updateResponse.ok) throw new Error(`Failed to update test ${test.id}: ${updateResponse.statusText}`);
    } catch (error) {
        throw error;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    _assignment_fetchUsers().then(() => {
        _assignment_fetchTests();
    });

    document.getElementById('_assignment_select_all').addEventListener('change', function() {
        const start = (_assignment_current_page - 1) * _assignment_page_size;
        const end = start + _assignment_page_size;
        const paginatedTests = _assignment_filtered_tests.slice(start, end);
        const visibleTestIds = paginatedTests.map(test => test.id.toString());

        if (this.checked) {
            visibleTestIds.forEach(id => _assignment_selected_tests.add(id));
        } else {
            visibleTestIds.forEach(id => _assignment_selected_tests.delete(id));
        }
        _assignment_renderTable();
    });

    document.addEventListener('change', function(e) {
        if (e.target.classList.contains('_assignment_test_checkbox')) {
            const testId = e.target.dataset.testId;
            if (e.target.checked) {
                _assignment_selected_tests.add(testId);
            } else {
                _assignment_selected_tests.delete(testId);
            }
            const start = (_assignment_current_page - 1) * _assignment_page_size;
            const end = start + _assignment_page_size;
            const paginatedTests = _assignment_filtered_tests.slice(start, end);
            const visibleTestIds = paginatedTests.map(test => test.id.toString());
            const allVisibleSelected = visibleTestIds.every(id => _assignment_selected_tests.has(id));
            document.getElementById('_assignment_select_all').checked = visibleTestIds.length > 0 && allVisibleSelected;
        }
    });

    document.getElementById('_assignment_multi_count').addEventListener('input', _assignment_renderMultiUserList);
});