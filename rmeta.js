const _engagement_api_urls = {
    engagements: 'https://demo.defectdojo.org/api/v2/engagements/?tags=sct&limit=10000',
    users: 'https://demo.defectdojo.org/api/v2/users/'
};

let _engagement_engagements = [];
let _engagement_filtered_engagements = [];
let _engagement_users = [];
let _engagement_date_columns = [];

function _engagement_showToast(message, type) {
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

async function _engagement_fetchUsers() {
    try {
        const response = await fetch(_engagement_api_urls.users);
        const data = await response.json();
        _engagement_users = data.results || [];
    } catch (error) {
        _engagement_showToast('Error fetching users: ' + error.message, 'error');
    }
}

async function _engagement_fetchEngagements() {
    document.getElementById('_engagement_loading_modal').style.display = 'flex';
    try {
        const response = await fetch(_engagement_api_urls.engagements);
        const data = await response.json();
        const validStatuses = ['Not Started', 'In Progress', 'On Hold'];
        _engagement_engagements = (data.results || []).filter(engagement => validStatuses.includes(engagement.status));
        _engagement_filtered_engagements = [..._engagement_engagements];
        _engagement_generateDateColumns();
        _engagement_renderTable();
    } catch (error) {
        _engagement_showToast('Error fetching engagements: ' + error.message, 'error');
    } finally {
        document.getElementById('_engagement_loading_modal').style.display = 'none';
    }
}

function _engagement_generateDateColumns() {
    const fromDateStr = document.getElementById('_engagement_from_date').value;
    const toDateStr = document.getElementById('_engagement_to_date').value;

    _engagement_date_columns = [];
    if (fromDateStr && toDateStr) {
        const fromDate = new Date(fromDateStr);
        const toDate = new Date(toDateStr);

        // Validate date range (max 32 days)
        const diffDays = Math.ceil((toDate - fromDate) / (1000 * 60 * 60 * 24)) + 1;
        if (diffDays < 1) {
            _engagement_showToast('To Date must be after From Date', 'error');
            return;
        }
        if (diffDays > 32) {
            _engagement_showToast('Date range cannot exceed 32 days', 'error');
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
            _engagement_date_columns.push(dateStr);
            currentDate.setDate(currentDate.getDate() + 1);
        }
    } else {
        // Default to a single column if no dates are selected
        _engagement_date_columns = ['All Dates'];
    }
}

function _engagement_filterTable() {
    const fromDateStr = document.getElementById('_engagement_from_date').value;
    const toDateStr = document.getElementById('_engagement_to_date').value;

    // Generate date columns for the new filter
    _engagement_generateDateColumns();
    if (_engagement_date_columns.length === 0) return; // Exit if date validation failed

    let fromDate, toDate;
    if (fromDateStr && toDateStr) {
        fromDate = new Date(fromDateStr);
        fromDate.setHours(0, 0, 0, 0); // Midnight
        toDate = new Date(toDateStr);
        toDate.setHours(23, 59, 59, 999); // End of day
    }

    _engagement_filtered_engagements = _engagement_engagements.filter(engagement => {
        const targetEndDate = new Date(engagement.target_end);
        const dateMatch = !fromDate || !toDate || (targetEndDate >= fromDate && targetEndDate <= toDate);
        return dateMatch;
    });

    _engagement_renderTable();
}

function _engagement_clearFilters() {
    document.getElementById('_engagement_from_date').value = '';
    document.getElementById('_engagement_to_date').value = '';
    _engagement_filtered_engagements = [..._engagement_engagements];
    _engagement_generateDateColumns();
    _engagement_renderTable();
}

function _engagement_refreshData() {
    _engagement_fetchEngagements();
}

function _engagement_showDetails(userName, date) {
    let engagementsToShow;
    if (userName === 'All' && date === 'All') {
        engagementsToShow = _engagement_filtered_engagements;
    } else {
        engagementsToShow = _engagement_filtered_engagements.filter(engagement => {
            const user = _engagement_users.find(u => u.id === engagement.lead);
            const engagementUserName = user ? `${user.first_name} ${user.last_name}` : 'N/A';
            const targetEndDate = new Date(engagement.target_end);
            const dateKey = targetEndDate.toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
                year: 'numeric'
            }).replace(/ /g, '-');
            return engagementUserName === userName && (date === 'All Dates' || dateKey === date);
        });
    }

    const tableBody = document.getElementById('_engagement_details_table');
    tableBody.innerHTML = engagementsToShow.map(engagement => {
        const user = _engagement_users.find(u => u.id === engagement.lead);
        const assignedTo = user ? `${user.first_name} ${user.last_name}` : 'N/A';
        const rmEta = engagement.target_end ? new Date(engagement.target_end).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        }).replace(/ /g, '-') : 'N/A';
        const appsecEta = engagement.target_start ? new Date(engagement.target_start).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        }).replace(/ /g, '-') : 'N/A';
        return `
            <tr>
                <td>${engagement.id}</td>
                <td>${engagement.name || 'N/A'}</td>
                <td>${assignedTo}</td>
                <td>${rmEta}</td>
                <td>${appsecEta}</td>
            </tr>
        `;
    }).join('');

    document.getElementById('_engagement_details_modal').style.display = 'flex';
}

function _engagement_closeDetailsModal() {
    document.getElementById('_engagement_details_modal').style.display = 'none';
}

function _engagement_renderTable() {
    const tableHeader = document.getElementById('_engagement_table_header');
    const cardContainer = document.getElementById('_engagement_card_container');

    // Define base columns + dynamic date columns
    const baseColumns = ['Users', 'Total'];
    const allColumns = ['Users', ..._engagement_date_columns, 'Total'];
    const gridTemplateColumns = `repeat(${allColumns.length}, 1fr)`;
    tableHeader.style.gridTemplateColumns = gridTemplateColumns;

    // Render table header
    tableHeader.innerHTML = allColumns.map(col => `<div>${col}</div>`).join('');

    // Group engagements by User
    const groupedData = {};
    _engagement_filtered_engagements.forEach(engagement => {
        const user = _engagement_users.find(u => u.id === engagement.lead);
        const userName = user ? `${user.first_name} ${user.last_name}` : 'N/A';
        const targetEndDate = new Date(engagement.target_end);
        const dateKey = targetEndDate.toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        }).replace(/ /g, '-');

        if (!groupedData[userName]) {
            groupedData[userName] = {
                userName,
                counts: {},
                total: 0
            };
        }
        groupedData[userName].counts[dateKey] = (groupedData[userName].counts[dateKey] || 0) + 1;
        groupedData[userName].total += 1;
    });

    // Convert grouped data to rows
    const rows = Object.values(groupedData).sort((a, b) => a.userName.localeCompare(b.userName));

    // Calculate totals for the last row
    const totalRow = {
        counts: {},
        total: 0
    };
    _engagement_date_columns.forEach(date => {
        totalRow.counts[date] = 0;
    });
    rows.forEach(row => {
        _engagement_date_columns.forEach(date => {
            totalRow.counts[date] += row.counts[date] || 0;
        });
        totalRow.total += row.total;
    });

    // Render table rows
    cardContainer.innerHTML = '';
    rows.forEach(row => {
        const card = document.createElement('div');
        card.className = 'card';
        card.style.gridTemplateColumns = gridTemplateColumns;

        const dateCounts = _engagement_date_columns.map(date => {
            const count = row.counts[date] || 0;
            return count > 0
                ? `<div><a onclick="_engagement_showDetails('${row.userName}', '${date}')">${count}</a></div>`
                : `<div>${count}</div>`;
        }).join('');
        const totalCount = row.total > 0
            ? `<div><a onclick="_engagement_showDetails('${row.userName}', 'All Dates')">${row.total}</a></div>`
            : `<div>${row.total}</div>`;
        card.innerHTML = `
            <div>${row.userName}</div>
            ${dateCounts}
            ${totalCount}
        `;
        cardContainer.appendChild(card);
    });

    // Render total row with hyperlink on overall total
    const totalCard = document.createElement('div');
    totalCard.className = 'card total-row';
    totalCard.style.gridTemplateColumns = gridTemplateColumns;
    const totalDateCounts = _engagement_date_columns.map(date => `<div>${totalRow.counts[date]}</div>`).join('');
    const overallTotal = totalRow.total > 0
        ? `<div><a onclick="_engagement_showDetails('All', 'All')">${totalRow.total}</a></div>`
        : `<div>${totalRow.total}</div>`;
    totalCard.innerHTML = `
        <div>Total</div>
        ${totalDateCounts}
        ${overallTotal}
    `;
    cardContainer.appendChild(totalCard);
}

document.addEventListener('DOMContentLoaded', () => {
    _engagement_fetchUsers().then(() => {
        _engagement_fetchEngagements();
    });
});