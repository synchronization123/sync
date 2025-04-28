const _changelog_api_urls = {
    engagements: 'https://demo.defectdojo.org/api/v2/engagements/?tags=sct&limit=10000',
    tests: 'https://demo.defectdojo.org/api/v2/tests/',
    users: 'https://demo.defectdojo.org/api/v2/users/'
};

let _changelog_engagements = [];
let _changelog_users = [];
let _changelog_jira_ids = new Set();
let _changelog_uploaded_file = null;

function _changelog_showToast(message, type) {
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

async function _changelog_fetchUsers() {
    try {
        const response = await fetch(_changelog_api_urls.users);
        const data = await response.json();
        _changelog_users = data.results || [];
    } catch (error) {
        _changelog_showToast('Error fetching users: ' + error.message, 'error');
    }
}

async function _changelog_fetchEngagements() {
    document.getElementById('_changelog_loading_modal').style.display = 'flex';
    try {
        const response = await fetch(_changelog_api_urls.engagements);
        const data = await response.json();
        _changelog_engagements = (data.results || []).filter(engagement => engagement.active === true);
        _changelog_populateEngagementDropdown();
    } catch (error) {
        _changelog_showToast('Error fetching engagements: ' + error.message, 'error');
    } finally {
        document.getElementById('_changelog_loading_modal').style.display = 'none';
    }
}

function _changelog_populateEngagementDropdown() {
    const select = document.getElementById('_changelog_engagement_select');
    select.innerHTML = '<option value="">Select Engagement</option>';
    _changelog_engagements.forEach(engagement => {
        const option = document.createElement('option');
        option.value = engagement.id;
        option.textContent = engagement.name || `Engagement ${engagement.id}`;
        select.appendChild(option);
    });
}

function _changelog_extractJiraIds(text) {
    // Case-insensitive regex pattern for Jira IDs (e.g., rt-44, RT-44, Rt-44)
    const jiraPattern = /\b[a-zA-Z]+-\d+\b/gi;
    const matches = text.match(jiraPattern) || [];
    // Convert all matches to uppercase and store in Set to avoid duplicates
    _changelog_jira_ids = new Set(matches.map(id => id.toUpperCase()));
    _changelog_updateJiraIdsTextarea();
}

function _changelog_updateJiraIdsTextarea() {
    const jiraIdsTextarea = document.getElementById('_changelog_jira_ids');
    jiraIdsTextarea.value = Array.from(_changelog_jira_ids).join(', ') || '';
}

async function _changelog_processFile(file) {
    if (!file) return;

    const fileType = file.name.split('.').pop().toLowerCase();
    let text = '';

    try {
        if (fileType === 'txt') {
            text = await file.text();
        } else if (fileType === 'xlsx') {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            text = XLSX.utils.sheet_to_csv(sheet);
        } else if (fileType === 'csv') {
            text = await file.text();
        } else {
            _changelog_showToast('Unsupported file type. Please use .txt, .xlsx, or .csv files.', 'error');
            return;
        }
        _changelog_uploaded_file = text; // Store the processed text for fetching
    } catch (error) {
        _changelog_showToast('Error processing file: ' + error.message, 'error');
    }
}

function _changelog_fetchJiraIdsFromText() {
    const inputTextarea = document.getElementById('_changelog_input_textarea');
    if (inputTextarea.value.trim()) {
        _changelog_extractJiraIds(inputTextarea.value);
    } else {
        _changelog_showToast('Please enter text to fetch Jira IDs.', 'error');
    }
}

function _changelog_fetchJiraIdsFromFile() {
    if (_changelog_uploaded_file) {
        _changelog_extractJiraIds(_changelog_uploaded_file);
    } else {
        _changelog_showToast('Please upload a file first to fetch Jira IDs.', 'error');
    }
}

async function _changelog_fetchExistingTests(engagementId) {
    try {
        const response = await fetch(`${_changelog_api_urls.tests}?engagement=${engagementId}&tags=mcr_jira`);
        const data = await response.json();
        return (data.results || []).map(test => test.title);
    } catch (error) {
        _changelog_showToast('Error fetching existing tests: ' + error.message, 'error');
        return [];
    }
}

async function _changelog_addJira() {
    const engagementId = document.getElementById('_changelog_engagement_select').value;
    if (!engagementId) {
        _changelog_showToast('Please select an engagement.', 'error');
        return;
    }

    if (_changelog_jira_ids.size === 0) {
        _changelog_showToast('No Jira IDs to add.', 'error');
        return;
    }

    if (!window.csrfToken) {
        _changelog_showToast('CSRF token not available. Please try refreshing the page.', 'error');
        return;
    }

    document.getElementById('_changelog_loading_modal').style.display = 'flex';

    try {
        // Fetch existing tests to check for duplicates
        const existingTitles = await _changelog_fetchExistingTests(engagementId);
        const jiraIdsToAdd = Array.from(_changelog_jira_ids).filter(jiraId => !existingTitles.includes(jiraId));

        if (jiraIdsToAdd.length === 0) {
            _changelog_showToast('All Jira IDs already exist as test titles for this engagement.', 'error');
            document.getElementById('_changelog_loading_modal').style.display = 'none';
            return;
        }

        // Fetch the engagement to get the lead
        const engagement = _changelog_engagements.find(eng => eng.id === parseInt(engagementId));
        const leadId = engagement.lead;

        const currentDate = new Date().toISOString().split('T')[0];
        const testDataTemplate = {
            tags: ['mcr_jira'],
            test_type_name: 'API Test',
            target_start: `${currentDate}T00:00:00Z`,
            target_end: `${currentDate}T00:00:00Z`,
            branch_tag: 'Pending',
            engagement: engagementId,
            lead: leadId,
            test_type: 1,
            environment: 1
        };

        // Add each Jira ID as a separate test
        for (const jiraId of jiraIdsToAdd) {
            const testData = { ...testDataTemplate, title: jiraId };
            await fetch(_changelog_api_urls.tests, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': window.csrfToken,
                    'Authorization': 'Token your_api_token_here' // Replace with actual API token or handle dynamically
                },
                credentials: 'include',
                body: JSON.stringify(testData)
            }).then(response => {
                if (!response.ok) {
                    throw new Error(`Failed to add test for Jira ID ${jiraId}`);
                }
                return response.json();
            });
        }

        _changelog_showToast(`Successfully added ${jiraIdsToAdd.length} Jira IDs as tests.`, 'success');
        // Clear the inputs after successful addition
        document.getElementById('_changelog_input_textarea').value = '';
        _changelog_uploaded_file = null;
        _changelog_jira_ids.clear();
        _changelog_updateJiraIdsTextarea();
    } catch (error) {
        _changelog_showToast('Error adding Jira IDs: ' + error.message, 'error');
    } finally {
        document.getElementById('_changelog_loading_modal').style.display = 'none';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Wait for CSRF token to be fetched before proceeding
    const checkCsrfToken = setInterval(() => {
        if (typeof window.csrfToken !== 'undefined') {
            clearInterval(checkCsrfToken);
            if (window.csrfToken === null) {
                _changelog_showToast('Failed to fetch CSRF token. Some features may not work.', 'error');
            }
            // Fetch users and engagements after CSRF token is available
            _changelog_fetchUsers().then(() => _changelog_fetchEngagements());
        }
    }, 100);

    // Drag and drop handling (stores file content but doesn't extract until Fetch is clicked)
    const dragDropArea = document.getElementById('_changelog_drag_drop_area');
    dragDropArea.addEventListener('dragover', e => {
        e.preventDefault();
        dragDropArea.classList.add('dragover');
    });
    dragDropArea.addEventListener('dragleave', () => {
        dragDropArea.classList.remove('dragover');
    });
    dragDropArea.addEventListener('drop', e => {
        e.preventDefault();
        dragDropArea.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            _changelog_processFile(files[0]);
        }
    });
    dragDropArea.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.txt,.xlsx,.csv';
        input.onchange = e => {
            const file = e.target.files[0];
            if (file) {
                _changelog_processFile(file);
            }
        };
        input.click();
    });
});