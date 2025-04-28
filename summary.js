const _summary_api_urls = {
    tests: 'https://demo.defectdojo.org/api/v2/tests/?tags=mcr_jira&limit=10000',
    users: 'https://demo.defectdojo.org/api/v2/users/',
    environments: 'https://demo.defectdojo.org/api/v2/development_environments/'
};

let _summary_tests = [];
let _summary_filtered_tests = [];
let _summary_users = [];
let _summary_environments = {};
let _summary_date_columns = [];

function _summary_showToast(message, type) {
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

async function _summary_fetchUsers() {
    try {
        const response = await fetch(_summary_api_urls.users);
        const data = await response.json();
        _summary_users = data.results || [];
    } catch (error) {
        _summary_showToast('Error fetching users: ' + error.message, 'error');
    }
}

async function _summary_fetchEnvironmentName(envId) {
    if (!envId) return 'N/A';
    if (_summary_environments[envId]) return _summary_environments[envId];

    try {
        const response = await fetch(`${_summary_api_urls.environments}${envId}/`);
        if (!response.ok) throw new Error(`Failed to fetch environment ${envId}: ${response.statusText}`);
        const data = await response.json();
        _summary_environments[envId] = data.name || 'N/A';
        return _summary_environments[envId];
    } catch (error) {
        _summary_showToast(`Error fetching environment ${envId}: ${error.message}`, 'error');
        return 'N/A';
    }
}

async function _summary_fetchTests() {
    document.getElementById('_summary_loading_modal').style.display = 'flex';
    try {
        const response = await fetch(_summary_api_urls.tests);
        const data = await response.json();
        _summary_tests = (data.results || []).filter(test => test.branch_tag === 'Completed');

        for (let test of _summary_tests) {
            if (test.environment) {
                test.environment_name = await _summary_fetchEnvironmentName(test.environment);
            } else {
                test.environment_name = 'N/A';
            }
        }

        _summary_filtered_tests = [..._summary_tests];
        _summary_populateFilters();
        _summary_generateDateColumns();
        _summary_renderTable();
    } catch (error) {
        _summary_showToast('Error fetching tests: ' + error.message, 'error');
    } finally {
        document.getElementById('_summary_loading_modal').style.display = 'none';
    }
}

function _summary_populateFilters() {
    const environments = [...new Set(_summary_tests.map(test => test.environment_name).filter(e => e && e !== 'N/A'))].sort();
    const environmentFilter = document.getElementById('_summary_environment_filter');
    environmentFilter.innerHTML = '<option value="">Filter by Type</option>' + 
        environments.map(e => `<option value="${e}">${e}</option>`).join('');
}

function _summary_generateDateColumns() {
    const fromDateStr = document.getElementById('_summary_from_date').value;
    const toDateStr = document.getElementById('_summary_to_date').value;

    _summary_date_columns = [];
    if (fromDateStr && toDateStr) {
        const fromDate = new Date(fromDateStr);
        const toDate = new Date(toDateStr);

        // Validate date range (max 32 days)
        const diffDays = Math.ceil((toDate - fromDate) / (1000 * 60 * 60 * 24)) + 1;
        if (diffDays < 1) {
            _summary_showToast('To Date must be after From Date', 'error');
            return;
        }
        if (diffDays > 32) {
            _summary_showToast('Date range cannot exceed 32 days', 'error');
            return;
        }

        // Generate date columns (midnight to midnight)
        let currentDate = new Date(fromDate);
        while (currentDate <= toDate) {
            const dateStr = currentDate.toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
                year: 'numeric'
            }).replace(/ /g, '-');
            _summary_date_columns.push(dateStr);
            currentDate.setDate(currentDate.getDate() + 1);
        }
    } else {
        // Default to a single column if no dates are selected
        _summary_date_columns = ['All Dates'];
    }
}

function _summary_filterTable() {
    const fromDateStr = document.getElementById('_summary_from_date').value;
    const toDateStr = document.getElementById('_summary_to_date').value;
    const environmentFilter = document.getElementById('_summary_environment_filter').value;

    // Generate date columns for the new filter
    _summary_generateDateColumns();
    if (_summary_date_columns.length === 0) return; // Exit if date validation failed

    let fromDate, toDate;
    if (fromDateStr && toDateStr) {
        fromDate = new Date(fromDateStr);
        fromDate.setHours(0, 0, 0, 0); // Midnight
        toDate = new Date(toDateStr);
        toDate.setHours(23, 59, 59, 999); // End of day
    }

    _summary_filtered_tests = _summary_tests.filter(test => {
        const updatedDate = new Date(test.updated);
        const dateMatch = !fromDate || !toDate || (updatedDate >= fromDate && updatedDate <= toDate);
        const environmentMatch = !environmentFilter || test.environment_name === environmentFilter;
        return dateMatch && environmentMatch;
    });

    _summary_renderTable();
}

function _summary_clearFilters() {
    document.getElementById('_summary_from_date').value = '';
    document.getElementById('_summary_to_date').value = '';
    document.getElementById('_summary_environment_filter').value = '';
    _summary_filtered_tests = [..._summary_tests];
    _summary_generateDateColumns();
    _summary_renderTable();
}

function _summary_refreshData() {
    _summary_fetchTests();
}

function _summary_renderTable() {
    const tableHeader = document.getElementById('_summary_table_header');
    const cardContainer = document.getElementById('_summary_card_container');

    // Define base columns + dynamic date columns with All Dates
    const baseColumns = ['Users', 'All Dates', 'Type', 'Count', 'Total'];
    const allColumns = ['Users', 'All Dates', ..._summary_date_columns, 'Type', 'Count', 'Total'];
    const gridTemplateColumns = `repeat(${allColumns.length}, 1fr)`;
    tableHeader.style.gridTemplateColumns = gridTemplateColumns;

    // Render table header with tooltip for All Dates
    const fromDateStr = document.getElementById('_summary_from_date').value;
    const toDateStr = document.getElementById('_summary_to_date').value;
    const dateRange = fromDateStr && toDateStr ? `${fromDateStr} to ${toDateStr}` : 'All Available Dates';
    tableHeader.innerHTML = allColumns.map((col, index) => 
        `<div${index === 1 ? ` title="Date Range: ${dateRange}"` : ''}>${col}</div>`
    ).join('');

    // Group tests by User and Type
    const groupedData = {};
    _summary_filtered_tests.forEach(test => {
        const user = _summary_users.find(u => u.id === test.lead);
        const userName = user ? `${user.first_name} ${user.last_name}` : 'N/A';
        const type = test.environment_name || 'N/A';
        const updatedDate = new Date(test.updated);
        const dateKey = updatedDate.toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        }).replace(/ /g, '-');

        const key = `${userName}|${type}`;
        if (!groupedData[key]) {
            groupedData[key] = {
                userName,
                type,
                counts: {},
                total: 0,
                allDates: 0
            };
        }
        groupedData[key].counts[dateKey] = (groupedData[key].counts[dateKey] || 0) + 1;
        groupedData[key].allDates += 1;
        groupedData[key].total += 1;
    });

    // Convert grouped data to rows
    const rows = Object.values(groupedData).sort((a, b) => a.userName.localeCompare(b.userName) || a.type.localeCompare(b.type));

    // Calculate totals for the last row
    const totalRow = {
        counts: {},
        allDates: 0,
        total: 0
    };
    _summary_date_columns.forEach(date => {
        totalRow.counts[date] = 0;
    });
    rows.forEach(row => {
        _summary_date_columns.forEach(date => {
            totalRow.counts[date] += row.counts[date] || 0;
        });
        totalRow.allDates += row.allDates;
        totalRow.total += row.total;
    });

    // Render table rows
    cardContainer.innerHTML = '';
    rows.forEach(row => {
        const card = document.createElement('div');
        card.className = 'card';
        card.style.gridTemplateColumns = gridTemplateColumns;

        const dateCounts = _summary_date_columns.map(date => `<div>${row.counts[date] || 0}</div>`).join('');
        card.innerHTML = `
            <div>${row.userName}</div>
            <div>${row.allDates}</div>
            ${dateCounts}
            <div>${row.type}</div>
            <div>${row.total}</div>
            <div>${row.total}</div>
        `;
        cardContainer.appendChild(card);
    });

    // Render total row
    const totalCard = document.createElement('div');
    totalCard.className = 'card total-row';
    totalCard.style.gridTemplateColumns = gridTemplateColumns;
    const totalDateCounts = _summary_date_columns.map(date => `<div>${totalRow.counts[date]}</div>`).join('');
    totalCard.innerHTML = `
        <div>Total</div>
        <div>${totalRow.allDates}</div>
        ${totalDateCounts}
        <div>-</div>
        <div>${totalRow.total}</div>
        <div>${totalRow.total}</div>
    `;
    cardContainer.appendChild(totalCard);
}

document.addEventListener('DOMContentLoaded', () => {
    _summary_fetchUsers().then(() => {
        _summary_fetchTests();
    });
});