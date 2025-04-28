const _mcrjiraopen_tests_api = 'https://demo.defectdojo.org/api/v2/tests/?tags=mcr_jira';
const _mcrjiraopen_users_api = 'https://demo.defectdojo.org/api/v2/users/';
const _mcrjiraopen_environments_api = 'https://demo.defectdojo.org/api/v2/development_environments/';
const _mcrjiraopen_dashboard_url = 'https://demo.defectdojo.org/api/key-v2';
const _mcrjiraopen_page_size = 20;
let _mcrjiraopen_tests = [];
let _mcrjiraopen_users = [];
let _mcrjiraopen_environments = {};
let _mcrjiraopen_current_page = 1;
let _mcrjiraopen_csrf_token = '';
let _mcrjiraopen_filtered_tests = [];

function _mcrjiraopen_showLoadingModal() {
    document.getElementById('_mcrjiraopen_loading_modal').style.display = 'flex';
}

function _mcrjiraopen_hideLoadingModal() {
    document.getElementById('_mcrjiraopen_loading_modal').style.display = 'none';
}

async function _mcrjiraopen_fetchCsrfToken() {
    try {
        const response = await fetch(_mcrjiraopen_dashboard_url);
        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const tokenInput = doc.querySelector('input[name="csrfmiddlewaretoken"]');
        _mcrjiraopen_csrf_token = tokenInput ? tokenInput.value : '';
    } catch (error) {
        _mcrjiraopen_showToast('Error fetching CSRF token', 'error');
    }
}

async function _mcrjiraopen_fetchUsers() {
    try {
        const response = await fetch(_mcrjiraopen_users_api);
        const data = await response.json();
        _mcrjiraopen_users = data.results.sort((a, b) => 
            `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`)
        );
        const leadSelect = document.getElementById('_mcrjiraopen_lead_filter');
        leadSelect.innerHTML = '<option value="">Filter by Lead</option>';
        _mcrjiraopen_users.forEach(user => {
            const option = document.createElement('option');
            option.value = user.id;
            option.textContent = `${user.first_name} ${user.last_name}`;
            leadSelect.appendChild(option);
        });
        $(`#_mcrjiraopen_lead_filter`).selectmenu({ width: '100%' });
    } catch (error) {
        _mcrjiraopen_showToast('Error fetching users', 'error');
    }
}

async function _mcrjiraopen_fetchEnvironmentName(envId) {
    if (!envId) return 'N/A';
    if (_mcrjiraopen_environments[envId]) {
        return _mcrjiraopen_environments[envId];
    }
    try {
        const response = await fetch(`${_mcrjiraopen_environments_api}${envId}/`);
        const data = await response.json();
        _mcrjiraopen_environments[envId] = data.name || 'Unknown';
        return _mcrjiraopen_environments[envId];
    } catch (error) {
        _mcrjiraopen_showToast('Error fetching environment name', 'error');
        return 'Unknown';
    }
}

async function _mcrjiraopen_fetchTests() {
    try {
        _mcrjiraopen_showLoadingModal();
        const response = await fetch(_mcrjiraopen_tests_api);
        const data = await response.json();
        _mcrjiraopen_tests = data.results.filter(test => ['Pending', 'On Hold'].includes(test.branch_tag));
        _mcrjiraopen_filtered_tests = [..._mcrjiraopen_tests];

        await _mcrjiraopen_populateDynamicFilters();
        await _mcrjiraopen_fetchUsers();
        await _mcrjiraopen_renderCards();
        _mcrjiraopen_updateTotalCount();
        _mcrjiraopen_showToast('Tests loaded successfully', 'success');
    } catch (error) {
        _mcrjiraopen_showToast('Error fetching tests', 'error');
    } finally {
        _mcrjiraopen_hideLoadingModal();
    }
}

async function _mcrjiraopen_populateDynamicFilters() {
    const versions = [...new Set(_mcrjiraopen_tests.map(test => test.version).filter(v => v))].sort();
    const environments = [...new Set(_mcrjiraopen_tests.map(test => test.environment).filter(e => e))];
    const commitHashes = [...new Set(_mcrjiraopen_tests.map(test => test.commit_hash).filter(c => c))].sort();
    const buildIds = [...new Set(_mcrjiraopen_tests.map(test => test.build_id).filter(b => b))].sort();

    const versionSelect = document.getElementById('_mcrjiraopen_version_filter');
    versionSelect.innerHTML = '<option value="">Filter by Version</option>';
    versions.forEach(version => {
        const option = document.createElement('option');
        option.value = version;
        option.textContent = version;
        versionSelect.appendChild(option);
    });
    $(`#_mcrjiraopen_version_filter`).selectmenu({ width: '100%' });

    const envSelect = document.getElementById('_mcrjiraopen_environment_filter');
    envSelect.innerHTML = '<option value="">Filter by Environment</option>';
    for (const envId of environments) {
        const name = await _mcrjiraopen_fetchEnvironmentName(envId);
        const option = document.createElement('option');
        option.value = envId;
        option.textContent = name;
        envSelect.appendChild(option);
    }

    const commitSelect = document.getElementById('_mcrjiraopen_commit_hash_filter');
    commitSelect.innerHTML = '<option value="">Filter by Commit Hash</option>';
    commitHashes.forEach(hash => {
        const option = document.createElement('option');
        option.value = hash;
        option.textContent = hash;
        commitSelect.appendChild(option);
    });

    const buildSelect = document.getElementById('_mcrjiraopen_build_id_filter');
    buildSelect.innerHTML = '<option value="">Filter by Build ID</option>';
    buildIds.forEach(build => {
        const option = document.createElement('option');
        option.value = build;
        option.textContent = build;
        buildSelect.appendChild(option);
    });

    // Add Enter key listener to filters
    const filterElements = [
        '_mcrjiraopen_search_input',
        '_mcrjiraopen_version_filter',
        '_mcrjiraopen_branch_tag_filter',
        '_mcrjiraopen_lead_filter',
        '_mcrjiraopen_environment_filter',
        '_mcrjiraopen_commit_hash_filter',
        '_mcrjiraopen_build_id_filter'
    ];
    filterElements.forEach(id => {
        const element = document.getElementById(id);
        element.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                _mcrjiraopen_filterTable();
            }
        });
    });
}

function _mcrjiraopen_getUserName(userId) {
    const parsedUserId = userId ? parseInt(userId) : null;
    const user = _mcrjiraopen_users.find(u => u.id === parsedUserId);
    return user ? `${user.first_name} ${user.last_name}` : 'Unknown';
}

function _mcrjiraopen_showToast(message, type) {
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

function _mcrjiraopen_updateTotalCount() {
    const countElement = document.getElementById('_mcrjiraopen_total_count');
    countElement.textContent = `Total Tests: ${_mcrjiraopen_filtered_tests.length}`;
}

async function _mcrjiraopen_renderCards() {
    const container = document.getElementById('_mcrjiraopen_card_container');
    container.innerHTML = '';
    const start = (_mcrjiraopen_current_page - 1) * _mcrjiraopen_page_size;
    const end = start + _mcrjiraopen_page_size;
    const paginatedTests = _mcrjiraopen_filtered_tests.slice(start, end);

    for (const test of paginatedTests) {
        const card = document.createElement('div');
        card.className = 'card';
        card.id = `_mcrjiraopen_card_${test.id}`;
        const envName = await _mcrjiraopen_fetchEnvironmentName(test.environment);
        card.innerHTML = `
            <div>${test.id}</div>
            <div>${test.title || 'N/A'}</div>
            <div>
                <textarea id="_mcrjiraopen_description_${test.id}" onblur="_mcrjiraopen_updateDescription(${test.id}, this.value)">${test.description || ''}</textarea>
            </div>
            <div>${test.version || 'N/A'}</div>
            <div>
                <select id="_mcrjiraopen_branch_tag_${test.id}" onchange="_mcrjiraopen_updateBranchTag(${test.id}, this.value)">
                    <option value="Pending" ${test.branch_tag === 'Pending' ? 'selected' : ''}>Pending</option>
                    <option value="On Hold" ${test.branch_tag === 'On Hold' ? 'selected' : ''}>On Hold</option>
                    <option value="Completed" ${test.branch_tag === 'Completed' ? 'selected' : ''}>Completed</option>
                    <option value="Rejected" ${test.branch_tag === 'Rejected' ? 'selected' : ''}>Rejected</option>
                </select>
            </div>
            <div>
                <select id="_mcrjiraopen_lead_${test.id}" onchange="_mcrjiraopen_updateLead(${test.id}, this.value)">
                    <option value="">Select Lead</option>
                    ${_mcrjiraopen_users.map(user => `<option value="${user.id}" ${test.lead === user.id ? 'selected' : ''}>${user.first_name} ${user.last_name}</option>`).join('')}
                </select>
            </div>
            <div>${envName}</div>
            <div>${test.commit_hash || 'N/A'}</div>
            <div>${test.build_id || 'N/A'}</div>
        `;
        container.appendChild(card);
        $(`#_mcrjiraopen_lead_${test.id}`).selectmenu({ width: '100%' });
    }

    _mcrjiraopen_renderPagination(_mcrjiraopen_filtered_tests.length);
}

function _mcrjiraopen_updateCard(test) {
    const card = document.getElementById(`_mcrjiraopen_card_${test.id}`);
    if (!card) return;

    card.children[0].textContent = test.id;
    card.children[1].textContent = test.title || 'N/A';
    card.children[2].querySelector('textarea').value = test.description || '';
    card.children[3].textContent = test.version || 'N/A';
    card.children[4].querySelector('select').value = test.branch_tag || 'Pending';
    card.children[5].querySelector('select').value = test.lead || '';
    $(`#_mcrjiraopen_lead_${test.id}`).selectmenu('refresh');
    card.children[7].textContent = test.commit_hash || 'N/A';
    card.children[8].textContent = test.build_id || 'N/A';
    _mcrjiraopen_fetchEnvironmentName(test.environment).then(name => {
        card.children[6].textContent = name;
    });
}

function _mcrjiraopen_renderPagination(totalItems) {
    const totalPages = Math.ceil(totalItems / _mcrjiraopen_page_size);
    const pagination = document.getElementById('_mcrjiraopen_pagination');
    pagination.innerHTML = `
        <button onclick="_mcrjiraopen_changePage(${_mcrjiraopen_current_page - 1})" ${_mcrjiraopen_current_page === 1 ? 'disabled' : ''}>Previous</button>
        <span>Page ${_mcrjiraopen_current_page} of ${totalPages}</span>
        <button onclick="_mcrjiraopen_changePage(${_mcrjiraopen_current_page + 1})" ${_mcrjiraopen_current_page === totalPages ? 'disabled' : ''}>Next</button>
    `;
}

function _mcrjiraopen_changePage(page) {
    _mcrjiraopen_current_page = page;
    _mcrjiraopen_renderCards();
}

function _mcrjiraopen_filterTable() {
    const searchInput = document.getElementById('_mcrjiraopen_search_input').value.toLowerCase();
    const versionFilter = document.getElementById('_mcrjiraopen_version_filter').value;
    const branchTagFilter = document.getElementById('_mcrjiraopen_branch_tag_filter').value;
    const leadFilter = document.getElementById('_mcrjiraopen_lead_filter').value;
    const envFilter = document.getElementById('_mcrjiraopen_environment_filter').value;
    const commitHashFilter = document.getElementById('_mcrjiraopen_commit_hash_filter').value;
    const buildIdFilter = document.getElementById('_mcrjiraopen_build_id_filter').value;

    _mcrjiraopen_filtered_tests = _mcrjiraopen_tests.filter(test => {
        const matchesSearch = test.title?.toLowerCase().includes(searchInput) || false;
        const matchesVersion = !versionFilter || test.version === versionFilter;
        const matchesBranchTag = !branchTagFilter || test.branch_tag === branchTagFilter;
        const matchesLead = !leadFilter || test.lead === parseInt(leadFilter);
        const matchesEnv = !envFilter || test.environment === parseInt(envFilter);
        const matchesCommitHash = !commitHashFilter || test.commit_hash === commitHashFilter;
        const matchesBuildId = !buildIdFilter || test.build_id === buildIdFilter;
        return matchesSearch && matchesVersion && matchesBranchTag && matchesLead && matchesEnv && matchesCommitHash && matchesBuildId;
    });

    _mcrjiraopen_current_page = 1;
    _mcrjiraopen_renderCards();
    _mcrjiraopen_updateTotalCount();
    _mcrjiraopen_showToast('Filters applied', 'success');
}

function _mcrjiraopen_clearFilters() {
    document.getElementById('_mcrjiraopen_search_input').value = '';
    document.getElementById('_mcrjiraopen_version_filter').value = '';
    document.getElementById('_mcrjiraopen_branch_tag_filter').value = '';
    document.getElementById('_mcrjiraopen_lead_filter').value = '';
    document.getElementById('_mcrjiraopen_environment_filter').value = '';
    document.getElementById('_mcrjiraopen_commit_hash_filter').value = '';
    document.getElementById('_mcrjiraopen_build_id_filter').value = '';
    $(`#_mcrjiraopen_version_filter`).selectmenu('refresh');
    $(`#_mcrjiraopen_lead_filter`).selectmenu('refresh');
    _mcrjiraopen_filtered_tests = [..._mcrjiraopen_tests];
    _mcrjiraopen_current_page = 1;
    _mcrjiraopen_renderCards();
    _mcrjiraopen_updateTotalCount();
    _mcrjiraopen_showToast('Filters cleared', 'success');
}

async function _mcrjiraopen_refreshData() {
    await _mcrjiraopen_fetchTests();
    _mcrjiraopen_showToast('Data refreshed', 'success');
}

async function _mcrjiraopen_fetchTestData(testId) {
    try {
        const response = await fetch(`https://demo.defectdojo.org/api/v2/tests/${testId}/`);
        if (!response.ok) {
            throw new Error(`Failed to fetch test ${testId}: ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        _mcrjiraopen_showToast(`Error fetching test data: ${error.message}`, 'error');
        console.error('Fetch test error:', error);
        return null;
    }
}

async function _mcrjiraopen_updateDescription(testId, value) {
    const test = _mcrjiraopen_tests.find(t => t.id === testId);
    if (!test) {
        _mcrjiraopen_showToast('Test not found', 'error');
        return;
    }

    const testData = await _mcrjiraopen_fetchTestData(testId);
    if (!testData) return;

    test.description = value || null;
    const updatedTest = {
        id: testData.id,
        title: testData.title || test.title || 'Untitled',
        target_start: testData.target_start || new Date().toISOString().split('T')[0],
        target_end: testData.target_end || new Date(Date.now() + 86400000).toISOString().split('T')[0],
        engagement: testData.engagement || 1,
        lead: testData.lead || test.lead || null,
        test_type: testData.test_type || 1,
        environment: testData.environment || test.environment || null,
        test_type_name: testData.test_type_name || 'Unknown',
        description: test.description,
        version: test.version || null,
        branch_tag: test.branch_tag || 'Pending',
        commit_hash: test.commit_hash || null,
        build_id: test.build_id || null
    };

    try {
        const response = await fetch(`https://demo.defectdojo.org/api/v2/tests/${testId}/`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': _mcrjiraopen_csrf_token
            },
            body: JSON.stringify(updatedTest)
        });
        if (response.ok) {
            _mcrjiraopen_updateCard(test);
            _mcrjiraopen_showToast(`Test ${test.id} description updated`, 'success');
        } else {
            const errorData = await response.json();
            _mcrjiraopen_showToast(`Failed to update description: ${errorData.message || response.statusText}`, 'error');
            console.error('Update description error:', errorData);
        }
    } catch (error) {
        _mcrjiraopen_showToast(`Error updating description: ${error.message}`, 'error');
        console.error('Update description error:', error);
    }
}

async function _mcrjiraopen_updateBranchTag(testId, value) {
    const test = _mcrjiraopen_tests.find(t => t.id === testId);
    if (!test) {
        _mcrjiraopen_showToast('Test not found', 'error');
        return;
    }

    const testData = await _mcrjiraopen_fetchTestData(testId);
    if (!testData) return;

    test.branch_tag = value;
    const updatedTest = {
        id: testData.id,
        title: testData.title || test.title || 'Untitled',
        target_start: testData.target_start || new Date().toISOString().split('T')[0],
        target_end: testData.target_end || new Date(Date.now() + 86400000).toISOString().split('T')[0],
        engagement: testData.engagement || 1,
        lead: testData.lead || test.lead || null,
        test_type: testData.test_type || 1,
        environment: testData.environment || test.environment || null,
        test_type_name: testData.test_type_name || 'Unknown',
        description: test.description || null,
        version: test.version || null,
        branch_tag: test.branch_tag,
        commit_hash: test.commit_hash || null,
        build_id: test.build_id || null
    };

    try {
        const response = await fetch(`https://demo.defectdojo.org/api/v2/tests/${testId}/`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': _mcrjiraopen_csrf_token
            },
            body: JSON.stringify(updatedTest)
        });
        if (response.ok) {
            _mcrjiraopen_updateCard(test);
            _mcrjiraopen_showToast(`Test ${test.id} branch tag updated`, 'success');
        } else {
            const errorData = await response.json();
            _mcrjiraopen_showToast(`Failed to update branch tag: ${errorData.message || response.statusText}`, 'error');
            console.error('Update branch tag error:', errorData);
        }
    } catch (error) {
        _mcrjiraopen_showToast(`Error updating branch tag: ${error.message}`, 'error');
        console.error('Update branch tag error:', error);
    }
}

async function _mcrjiraopen_updateLead(testId, userId) {
    console.log('updateLead called:', { testId, userId, type: typeof userId });

    const test = _mcrjiraopen_tests.find(t => t.id === testId);
    if (!test) {
        _mcrjiraopen_showToast('Test not found', 'error');
        console.error('Test not found:', testId);
        return;
    }

    const testData = await _mcrjiraopen_fetchTestData(testId);
    if (!testData) {
        console.error('No test data fetched for testId:', testId);
        return;
    }
    console.log('Fetched testData:', testData);

    // Ensure userId is a number or null
    const newLead = userId && userId !== '' ? parseInt(userId, 10) : null;
    if (isNaN(newLead) && userId !== '') {
        _mcrjiraopen_showToast('Invalid lead ID', 'error');
        console.error('Invalid userId:', userId);
        return;
    }
    test.lead = newLead;
    console.log('Updated test.lead:', test.lead);

    const updatedTest = {
        id: testData.id,
        title: testData.title || test.title || 'Untitled',
        target_start: testData.target_start || new Date().toISOString().split('T')[0],
        target_end: testData.target_end || new Date(Date.now() + 86400000).toISOString().split('T')[0],
        engagement: testData.engagement || 1,
        lead: newLead, // Use numeric lead
        test_type: testData.test_type || 1,
        environment: testData.environment || test.environment || null,
        test_type_name: testData.test_type_name || 'Unknown',
        description: test.description || null,
        version: test.version || null,
        branch_tag: test.branch_tag || 'Pending',
        commit_hash: test.commit_hash || null,
        build_id: test.build_id || null
    };
    console.log('PUT payload:', updatedTest);

    try {
        const response = await fetch(`https://demo.defectdojo.org/api/v2/tests/${testId}/`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': _mcrjiraopen_csrf_token
            },
            body: JSON.stringify(updatedTest)
        });
        if (response.ok) {
            _mcrjiraopen_updateCard(test);
            _mcrjiraopen_showToast(`Test ${test.id} lead updated to ${_mcrjiraopen_getUserName(newLead)}`, 'success');
            console.log('Lead update successful:', newLead);
        } else {
            const errorData = await response.json();
            _mcrjiraopen_showToast(`Failed to update lead: ${errorData.message || response.statusText}`, 'error');
            console.error('Update lead error:', errorData);
        }
    } catch (error) {
        _mcrjiraopen_showToast(`Error updating lead: ${error.message}`, 'error');
        console.error('Update lead error:', error);
    }
}

function _mcrjiraopen_exportToCSV() {
    const headers = ['Id', 'Title', 'Description', 'Version', 'Branch Tag', 'Lead', 'Environment', 'Commit Hash', 'Build ID'];
    const rows = _mcrjiraopen_filtered_tests.map(async test => {
        const envName = await _mcrjiraopen_fetchEnvironmentName(test.environment);
        return [
            test.id,
            `"${(test.title || 'N/A').replace(/"/g, '""')}"`,
            `"${(test.description || '').replace(/"/g, '""')}"`,
            test.version || 'N/A',
            test.branch_tag || 'Pending',
            _mcrjiraopen_getUserName(test.lead),
            envName,
            test.commit_hash || 'N/A',
            test.build_id || 'N/A'
        ].join(',');
    });

    Promise.all(rows).then(resolvedRows => {
        const csvContent = [
            headers.join(','),
            ...resolvedRows
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'mcr_jira_open_tests.csv';
        link.click();
        URL.revokeObjectURL(link.href);
        _mcrjiraopen_showToast('Table exported to CSV', 'success');
    }).catch(error => {
        _mcrjiraopen_showToast(`Error exporting CSV: ${error.message}`, 'error');
        console.error('Export CSV error:', error);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('mcr-jira-open').classList.contains('active')) {
        _mcrjiraopen_fetchCsrfToken().then(_mcrjiraopen_fetchTests);
    }

    document.querySelector('.tab[data-tab="mcr-jira-open"]').addEventListener('click', () => {
        if (!_mcrjiraopen_tests.length) {
            _mcrjiraopen_fetchCsrfToken().then(_mcrjiraopen_fetchTests);
        }
    });
});