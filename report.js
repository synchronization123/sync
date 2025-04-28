const _report_api_urls = {
    engagements: 'https://demo.defectdojo.org/api/v2/engagements/?active=true&limit=1000',
    tests: 'https://demo.defectdojo.org/api/v2/tests/?engagement=',
    users: 'https://demo.defectdojo.org/api/v2/users/',
    dashboard: 'https://demo.defectdojo.org/api/key-v2'
};
let _report_engagements = [];
let _report_users = [];
let _report_csrf_token = '';
let _report_selected_engagement_id = null;

function _report_sanitizeText(text) {
    return text ? text.replace(/<[^>]+>/g, '') : '';
}

function _report_showToast(message, type) {
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

async function _report_fetchCsrfToken() {
    try {
        const response = await fetch(_report_api_urls.dashboard);
        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const tokenInput = doc.querySelector('input[name="csrfmiddlewaretoken"]');
        _report_csrf_token = tokenInput ? tokenInput.value : '';
        if (!_report_csrf_token) {
            _report_showToast('CSRF token not found', 'error');
        }
    } catch (error) {
        _report_showToast('Error fetching CSRF token: ' + error.message, 'error');
    }
}

async function _report_fetchUsers() {
    try {
        const response = await fetch(_report_api_urls.users);
        const data = await response.json();
        _report_users = data.results;
    } catch (error) {
        _report_showToast('Error fetching users: ' + error.message, 'error');
    }
}

async function _report_fetchEngagements() {
    try {
        const response = await fetch(_report_api_urls.engagements);
        const data = await response.json();
        _report_engagements = data.results;
        _report_renderEngagementDropdown();
    } catch (error) {
        _report_showToast('Error fetching engagements: ' + error.message, 'error');
    }
}

function _report_renderEngagementDropdown() {
    const select = $('#_report_engagement_select');
    select.empty().append('<option value="">Select Engagement</option>');
    _report_engagements.forEach(engagement => {
        select.append(`<option value="${engagement.id}">${engagement.name}</option>`);
    });

    select.selectmenu({
        width: 300,
        change: async function(event, ui) {
            _report_selected_engagement_id = ui.item.value;
            if (_report_selected_engagement_id) {
                $('#_report_container').show();
                $('#_report_engagement_name').text(
                    _report_engagements.find(e => e.id == _report_selected_engagement_id).name
                );
                // Check for risk_register tests
                const riskRegisterResponse = await fetch(`${_report_api_urls.tests}${_report_selected_engagement_id}&tags=risk_register&limit=100`);
                const riskRegisterData = await riskRegisterResponse.json();
                const riskRegisterExists = riskRegisterData.results && riskRegisterData.results.length > 0;
                const riskRegisterButton = $('#_report_create_risk_register');
                if (riskRegisterExists) {
                    riskRegisterButton.hide();
                } else {
                    riskRegisterButton.show();
                }
                // Check for reporting tests
                const reportingResponse = await fetch(`${_report_api_urls.tests}${_report_selected_engagement_id}&tags=reporting&limit=100`);
                const reportingData = await reportingResponse.json();
                const reportingExists = reportingData.results && reportingData.results.length > 0;
                const reportingButton = $('#_report_create_reporting_test');
                if (reportingExists) {
                    reportingButton.hide();
                } else {
                    reportingButton.show();
                }
                _report_fetchTests();
            } else {
                $('#_report_container').hide();
                $('#_report_create_risk_register').hide();
                $('#_report_create_reporting_test').hide();
            }
        }
    }).selectmenu('menuWidget').addClass('ui-menu-scroll');
}

async function _report_fetchTests() {
    try {
        const summaryResponse = await fetch(
            `${_report_api_urls.tests}${_report_selected_engagement_id}&tags=mcr_jira&limit=100`
        );
        const summaryData = await summaryResponse.json();
        _report_renderSummaryTable1_1(summaryData.results);

        const reportingResponse = await fetch(
            `${_report_api_urls.tests}${_report_selected_engagement_id}&tags=reporting&limit=100`
        );
        const reportingData = await reportingResponse.json();
        _report_renderSummaryTable1_2(reportingData.results);

        const buildResponse = await fetch(
            `${_report_api_urls.tests}${_report_selected_engagement_id}&tags=mcr_jira&limit=10000`
        );
        const buildData = await buildResponse.json();
        _report_renderBuildTable(buildData.results);

        const securityResponse = await fetch(
            `${_report_api_urls.tests}${_report_selected_engagement_id}&tags=risk_register&limit=10000`
        );
        const securityData = await securityResponse.json();
        _report_renderSecurityTable(securityData.results);

        _report_showToast('Report data loaded', 'success');
    } catch (error) {
        _report_showToast('Error fetching test data: ' + error.message, 'error');
    }
}

function _report_renderSummaryTable1_1(tests) {
    const tbody = $('#_report_summary_table_1_1 tbody');
    tbody.empty();
    const engagement = _report_engagements.find(e => e.id == _report_selected_engagement_id);
    const functionalJiras = tests.filter(test => test.commit_hash !== 'Security').length;
    const securityJiras = tests.filter(test => test.commit_hash === 'Security').length;
    const today = new Date().toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
    tbody.append(`
        <tr>
            <td>${engagement.name || 'N/A'}</td>
            <td>${today}</td>
            <td>${functionalJiras}</td>
            <td>${securityJiras}</td>
        </tr>
    `);
}

function _report_renderSummaryTable1_2(tests) {
    const tbody = $('#_report_summary_table_1_2 tbody');
    tbody.empty();
    tests.forEach(test => {
        const description = _report_sanitizeText(test.description);
        tbody.append(`
            <tr>
                <td class="description"><textarea id="_report_desc_${test.id}" onblur="_report_updateTest(${test.id}, 'description', this.value)">${description}</textarea></td>
                <td>
                    <select id="_report_commit_${test.id}" onchange="_report_updateTest(${test.id}, 'commit_hash', this.value)">
                        <option value="Yes" ${test.commit_hash === 'Yes' ? 'selected' : ''}>Yes</option>
                        <option value="No" ${test.commit_hash === 'No' ? 'selected' : ''}>No</option>
                    </select>
                </td>
            </tr>
        `);
    });
}

function _report_renderBuildTable(tests) {
    const tbody = $('#_report_build_table tbody');
    tbody.empty();
    tests.forEach((test, index) => {
        const reviewer = _report_users.find(u => u.id === test.lead);
        const reviewerName = reviewer ? `${reviewer.first_name} ${reviewer.last_name}` : 'N/A';
        const testApproach = test.commit_hash === 'Security' ? 'Security Jira' : 'Functional Jira';
        const description = _report_sanitizeText(test.description).toLowerCase();
        let manualSecureCodeReview = 'NA';
        if (description.includes('manual secure code review: done')) manualSecureCodeReview = 'Done';
        else if (description.includes('manual secure code review: not done')) manualSecureCodeReview = 'Not Done';
        else if (description.includes('manual secure code review: na') || description.includes('manual secure code review: ')) manualSecureCodeReview = 'NA';

        let manualSecurityTesting = 'NA';
        if (description.includes('manual security testing: done')) manualSecurityTesting = 'Done';
        else if (description.includes('manual security testing: not done')) manualSecurityTesting = 'Not Done';
        else if (description.includes('manual security testing: na') || description.includes('manual security testing: ')) manualSecurityTesting = 'NA';

        const srNo = index + 1;
        tbody.append(`
            <tr>
                <td>${srNo}</td>
                <td>${reviewerName}</td>
                <td>${_report_sanitizeText(test.title)}</td>
                <td>${testApproach}</td>
                <td>
                    <select id="_report_mscr_${test.id}" onchange="_report_updateTest(${test.id}, 'manual_secure_code_review', this.value)">
                        <option value="NA" ${manualSecureCodeReview === 'NA' ? 'selected' : ''}>NA</option>
                        <option value="Done" ${manualSecureCodeReview === 'Done' ? 'selected' : ''}>Done</option>
                        <option value="Not Done" ${manualSecureCodeReview === 'Not Done' ? 'selected' : ''}>Not Done</option>
                    </select>
                </td>
                <td>
                    <select id="_report_mst_${test.id}" onchange="_report_updateTest(${test.id}, 'manual_security_testing', this.value)">
                        <option value="NA" ${manualSecurityTesting === 'NA' ? 'selected' : ''}>NA</option>
                        <option value="Done" ${manualSecurityTesting === 'Done' ? 'selected' : ''}>Done</option>
                        <option value="Not Done" ${manualSecurityTesting === 'Not Done' ? 'selected' : ''}>Not Done</option>
                    </select>
                </td>
            </tr>
            <tr>
                <td colspan="6" class="description"><textarea id="_report_desc_${test.id}" onblur="_report_updateTest(${test.id}, 'description', this.value)">${_report_sanitizeText(test.description)}</textarea></td>
            </tr>
            <tr>
                <td colspan="6" class="blank-row"></td>
            </tr>
        `);
    });
}

function _report_renderSecurityTable(tests) {
    const tbody = $('#_report_security_table tbody');
    tbody.empty();
    tests.forEach((test, index) => {
        const status = test.commit_hash || 'NA';
        tbody.append(`
            <tr>
                <td>${index + 1}</td>
                <td>${_report_sanitizeText(test.title)}</td>
                <td>
                    <select id="_report_status_${test.id}" onchange="_report_updateTest(${test.id}, 'commit_hash', this.value)">
                        <option value="NA" ${status === 'NA' ? 'selected' : ''}>NA</option>
                        <option value="Found" ${status === 'Found' ? 'selected' : ''}>Found</option>
                        <option value="Not Found" ${status === 'Not Found' ? 'selected' : ''}>Not Found</option>
                    </select>
                </td>
                <td class="description"><textarea id="_report_comment_${test.id}" onblur="_report_updateTest(${test.id}, 'description', this.value)">${_report_sanitizeText(test.description)}</textarea></td>
            </tr>
        `);
    });
}

async function _report_updateTest(testId, field, value) {
    try {
        const getResponse = await fetch(`https://demo.defectdojo.org/api/v2/tests/${testId}/`);
        if (!getResponse.ok) throw new Error('Failed to fetch test data: ' + getResponse.statusText);
        const testData = await getResponse.json();

        console.log('Fetched test data:', testData);

        const updatedData = {
            id: testData.id,
            test_type_name: testData.test_type_name || 'Manual Test',
            scan_type: testData.scan_type || 'Manual Scan',
            title: testData.title || 'Updated Test',
            target_start: testData.target_start || new Date().toISOString().split('T')[0],
            target_end: testData.target_end || new Date().toISOString().split('T')[0],
            engagement: testData.engagement || _report_selected_engagement_id,
            lead: testData.lead || null,
            test_type: testData.test_type || 1,
            environment: testData.environment || 'Development',
            [field]: value
        };

        console.log('PUT payload:', updatedData);

        const putResponse = await fetch(`https://demo.defectdojo.org/api/v2/tests/${testId}/`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': _report_csrf_token
            },
            body: JSON.stringify(updatedData)
        });

        if (!putResponse.ok) {
            const errorText = await putResponse.text();
            throw new Error(`Failed to update test: ${putResponse.status} - ${errorText}`);
        }

        _report_showToast('Test updated', 'success');
        _report_fetchTests();
    } catch (error) {
        _report_showToast(`Error updating test: ${error.message}`, 'error');
        console.error('Update error:', error);
    }
}

async function _report_createRiskRegisterTests() {
    try {
        const engagement = _report_engagements.find(e => e.id == _report_selected_engagement_id);
        const titles = ['sql', 'xss', 'xxe'];
        const currentDate = new Date().toISOString().split('T')[0] + 'T00:00:00Z';
        const lead = engagement.lead;

        const existingTestsResponse = await fetch(`${_report_api_urls.tests}${_report_selected_engagement_id}&limit=10000`);
        if (!existingTestsResponse.ok) {
            throw new Error(`Failed to fetch existing tests: ${existingTestsResponse.statusText}`);
        }
        const existingTestsData = await existingTestsResponse.json();
        
        const existingTitles = (existingTestsData.results || [])
            .filter(test => test && typeof test.title === 'string')
            .map(test => test.title.toLowerCase());

        console.log('Existing titles for risk_register:', existingTitles);

        for (const title of titles) {
            if (!existingTitles.includes(title.toLowerCase())) {
                const testData = {
                    test_type_name: "Anchore Grype",
                    scan_type: "Anchore Grype",
                    target_start: currentDate,
                    target_end: currentDate,
                    commit_hash: "NA",
                    engagement: _report_selected_engagement_id,
                    lead: lead,
                    test_type: 37,
                    environment: 2,
                    title: title,
                    tags: ["risk_register"]
                };

                const response = await fetch('https://demo.defectdojo.org/api/v2/tests/', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': _report_csrf_token
                    },
                    body: JSON.stringify(testData)
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Failed to create test for ${title}: ${response.status} - ${errorText}`);
                }

                _report_showToast(`Test created for ${title}`, 'success');
            } else {
                console.log(`Test with title "${title}" already exists, skipping creation.`);
            }
        }

        $('#_report_create_risk_register').hide();
        _report_fetchTests();
    } catch (error) {
        _report_showToast(`Error creating tests: ${error.message}`, 'error');
        console.error('Create error:', error);
    }
}

async function _report_createReportingTest() {
    try {
        const engagement = _report_engagements.find(e => e.id == _report_selected_engagement_id);
        const title = 'reporting';
        const currentDate = new Date().toISOString().split('T')[0] + 'T00:00:00Z';
        const lead = engagement.lead;

        const existingTestsResponse = await fetch(`${_report_api_urls.tests}${_report_selected_engagement_id}&limit=10000`);
        if (!existingTestsResponse.ok) {
            throw new Error(`Failed to fetch existing tests: ${existingTestsResponse.statusText}`);
        }
        const existingTestsData = await existingTestsResponse.json();
        
        const existingTitles = (existingTestsData.results || [])
            .filter(test => test && typeof test.title === 'string')
            .map(test => test.title.toLowerCase());

        console.log('Existing titles for reporting:', existingTitles);

        if (!existingTitles.includes(title.toLowerCase())) {
            const testData = {
                test_type_name: "Anchore Grype",
                scan_type: "Anchore Grype",
                target_start: currentDate,
                target_end: currentDate,
                commit_hash: "No",
                engagement: _report_selected_engagement_id,
                lead: lead,
                test_type: 37,
                environment: 2,
                title: title,
                tags: ["reporting"]
            };

            const response = await fetch('https://demo.defectdojo.org/api/v2/tests/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': _report_csrf_token
                },
                body: JSON.stringify(testData)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to create test for ${title}: ${response.status} - ${errorText}`);
            }

            _report_showToast(`Test created for ${title}`, 'success');
        } else {
            console.log(`Test with title "${title}" already exists, skipping creation.`);
        }

        $('#_report_create_reporting_test').hide();
        _report_fetchTests();
    } catch (error) {
        _report_showToast(`Error creating reporting test: ${error.message}`, 'error');
        console.error('Create error:', error);
    }
}

function _report_generateTableHtml(tableId) {
    const tbody = $(`#${tableId} tbody`);
    let newTbodyHtml = '';

    if (tableId === '_report_build_table') {
        let testIndex = 0;
        let rows = [];
        tbody.find('tr').each(function(index) {
            const row = $(this);
            if (index % 3 === 0) {
                testIndex++;
                let rowHtml = '<tr>';
                row.find('td').each(function(cellIndex) {
                    const cell = $(this);
                    let cellValue = '';
                    const select = cell.find('select');
                    if (select.length) {
                        cellValue = select.val();
                    } else {
                        cellValue = _report_sanitizeText(cell.text());
                    }
                    rowHtml += `<td>${cellValue}</td>`;
                });
                rowHtml += '</tr>';
                rows.push(rowHtml);
            } else if (index % 3 === 1) {
                const textarea = row.find('textarea');
                const descriptionValue = textarea.length ? _report_sanitizeText(textarea.val()) : '';
                rows.push(`
                    <tr>
                        <td colspan="6" class="description">${descriptionValue}</td>
                    </tr>
                `);
            } else {
                rows.push(`
                    <tr>
                        <td colspan="6" class="blank-row"></td>
                    </tr>
                `);
            }
        });
        for (let i = 0; i < rows.length; i += 3) {
            newTbodyHtml += `
                <div class="test-entry">
                    ${rows[i]}
                    ${rows[i + 1]}
                    ${rows[i + 2]}
                </div>
            `;
        }
    } else if (tableId === '_report_security_table') {
        tbody.find('tr').each(function() {
            let rowHtml = '<tr>';
            $(this).find('td').each(function() {
                const cell = $(this);
                let cellValue = '';
                const textarea = cell.find('textarea');
                const select = cell.find('select');
                if (textarea.length) {
                    cellValue = _report_sanitizeText(textarea.val());
                } else if (select.length) {
                    cellValue = select.val();
                } else {
                    cellValue = _report_sanitizeText(cell.text());
                }
                const className = cell.hasClass('description') ? ' class="description"' : '';
                rowHtml += `<td${className}>${cellValue}</td>`;
            });
            rowHtml += '</tr>';
            newTbodyHtml += `<div class="security-entry">${rowHtml}</div>`;
        });
    } else {
        tbody.find('tr').each(function() {
            let rowHtml = '<tr>';
            $(this).find('td').each(function() {
                const cell = $(this);
                let cellValue = '';
                const textarea = cell.find('textarea');
                const select = cell.find('select');
                if (textarea.length) {
                    cellValue = _report_sanitizeText(textarea.val());
                } else if (select.length) {
                    cellValue = select.val();
                } else {
                    cellValue = _report_sanitizeText(cell.text());
                }
                const className = cell.hasClass('description') ? ' class="description"' : '';
                rowHtml += `<td${className}>${cellValue}</td>`;
            });
            rowHtml += '</tr>';
            newTbodyHtml += rowHtml;
        });
    }

    return newTbodyHtml;
}

function _report_view() {
    if (!_report_selected_engagement_id) {
        _report_showToast('Please select an engagement', 'error');
        return;
    }
    const engagement = _report_engagements.find(e => e.id == _report_selected_engagement_id);
    const buildName = engagement.name || 'Report';

    const summaryTable1_1Html = _report_generateTableHtml('_report_summary_table_1_1');
    const summaryTable1_2Html = _report_generateTableHtml('_report_summary_table_1_2');
    const buildTableHtml = _report_generateTableHtml('_report_build_table');
    const securityTableHtml = _report_generateTableHtml('_report_security_table');

    const reportHtml = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${buildName} Report</title>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
            <style>
                body {
                    font-family: 'Inter', sans-serif;
                    margin: 0;
                    background: #fff;
                    padding: 0;
                    width: 100%;
                }
                .report-container {
                    width: 190mm;
                    margin: 20mm auto;
                    background: #ffffff;
                    border: none;
                    padding: 15px;
                }
                .report-header {
                    text-align: center;
                    margin-bottom: 20px;
                }
                .report-header h1 {
                    font-size: 26px;
                    color: #455a64;
                    margin: 0;
                    font-weight: 600;
                }
                .report-section-title {
                    font-size: 20px;
                    color: #37474f;
                    margin: 20px 0 10px;
                    font-weight: 500;
                }
                .table-container {
                    margin-bottom: 20px;
                    width: 100%;
                }
                .report-table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 20px;
                    table-layout: fixed;
                }
                .report-table th {
                    background: #455a64 !important;
                    color: #fff;
                    font-weight: 500;
                    text-transform: uppercase;
                    text-align: center;
                    border: 1px solid #d3d3d3;
                    padding: 10px;
                    font-size: 12px;
                }
                .report-table td {
                    background: #fafafa;
                    text-align: center;
                    word-wrap: break-word;
                    border: 1px solid #d3d3d3;
                    padding: 10px;
                    font-size: 12px;
                    vertical-align: top;
                }
                .report-table td.description {
                    text-align: left;
                    max-width: 150mm;
                    background: #e0e0e0;
                    font-weight: 500;
                }
                .report-table td.blank-row {
                    background: #fff;
                    border: none;
                    height: 10px;
                }
                .save-pdf-btn {
                    padding: 10px 20px;
                    background: #0288d1;
                    color: #fff;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 500;
                    transition: background 0.3s;
                    margin: 10px 0;
                }
                .save-pdf-btn:hover {
                    background: #0277bd;
                }
                @media print {
                    body {
                        background: #fff;
                        margin: 0;
                        width: 210mm;
                        position: relative;
                    }
                    .report-container {
                        width: 190mm;
                        margin: 20mm auto;
                        border: none;
                        padding: 15px;
                        position: relative;
                    }
                    .save-pdf-btn {
                        display: none !important;
                    }
                    .summary-section {
                        page-break-after: always;
                    }
                    .summary-section .report-section-title {
                        font-size: 24px;
                        margin: 30px 0 15px;
                    }
                    .summary-section .report-table {
                        margin-bottom: 30px;
                    }
                    .summary-section .report-table th {
                        font-size: 12px;
                        padding: 12px;
                    }
                    .summary-section .report-table td {
                        font-size: 12px;
                        padding: 12px;
                    }
                    .summary-section .report-table td.description {
                        max-width: 170mm;
                    }
                    .build-section {
                        page-break-before: always;
                        page-break-after: always;
                    }
                    .build-section .test-entry {
                        page-break-inside: avoid;
                    }
                    .build-section .report-table th {
                        font-size: 10px;
                        padding: 5px;
                    }
                    .build-section .report-table td {
                        font-size: 10px;
                        padding: 5px;
                    }
                    .build-section .report-table td.description {
                        max-width: 150mm;
                    }
                    .security-section {
                        page-break-before: always;
                    }
                    .security-section .security-entry {
                        page-break-inside: avoid;
                    }
                    .security-section .report-table th {
                        font-size: 10px;
                        padding: 5px;
                    }
                    .security-section .report-table td {
                        font-size: 10px;
                        padding: 5px;
                    }
                    .security-section .report-table td.description {
                        max-width: 150mm;
                    }
                    @page {
                        margin: 20mm;
                        size: A4;
                    }
                }
            </style>
        </head>
        <body>
            <div class="report-container">
                <button class="save-pdf-btn" onclick="window.print()">Save as PDF</button>
                <div class="report-header">
                    <h1>${buildName}</h1>
                </div>
                <div class="summary-section">
                    <h2 class="report-section-title">Summary</h2>
                    <div class="table-container">
                        <table class="report-table" id="_report_summary_table_1_1">
                            <thead>
                                <tr>
                                    <th>Build</th>
                                    <th>Date</th>
                                    <th colspan="2">Total Changelog</th>
                                </tr>
                                <tr>
                                    <th></th>
                                    <th></th>
                                    <th>Functional Jira</th>
                                    <th>Security Jira</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${summaryTable1_1Html}
                            </tbody>
                        </table>
                        <table class="report-table" id="_report_summary_table_1_2">
                            <thead>
                                <tr>
                                    <th>Description</th>
                                    <th style="width: 50mm;">Contrast Verification</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${summaryTable1_2Html}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div class="build-section">
                    <h2 class="report-section-title">Build</h2>
                    <div class="table-container" style="overflow-x: hidden;">
                        <table class="report-table" id="_report_build_table">
                            <thead>
                                <tr>
                                    <th>Sr. No.</th>
                                    <th>Changelog Reviewer</th>
                                    <th>Issue Key</th>
                                    <th>Test Approach</th>
                                    <th>Manual Secure Code Review</th>
                                    <th>Manual Security Testing</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${buildTableHtml}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div class="security-section">
                    <h2 class="report-section-title">Security Analysis</h2>
                    <div class="table-container">
                        <table class="report-table" id="_report_security_table">
                            <thead>
                                <tr>
                                    <th>Sr. No.</th>
                                    <th>Category</th>
                                    <th>Status</th>
                                    <th>Comment</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${securityTableHtml}
                            </tbody>
                        </table>
                    </div>
                </div>
                <button class="save-pdf-btn" onclick="window.print()">Save as PDF</button>
            </div>
        </body>
        </html>
    `;
    const newTab = window.open('', '_blank');
    newTab.document.write(reportHtml);
    newTab.document.close();
}

$(document).ready(() => {
    _report_fetchCsrfToken().then(() => {
        _report_fetchUsers();
        _report_fetchEngagements();
    });
});