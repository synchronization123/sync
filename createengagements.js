const _create_engagement_api_urls = {
    engagements: 'https://demo.defectdojo.org/api/v2/engagements/'
};

function _create_engagement_showToast(message, type) {
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

async function _create_engagement_checkDuplicate(name) {
    try {
        const response = await fetch(`${_create_engagement_api_urls.engagements}?name=${encodeURIComponent(name)}`);
        const data = await response.json();
        return (data.results || []).length > 0;
    } catch (error) {
        _create_engagement_showToast('Error checking duplicate for "' + name + '": ' + error.message, 'error');
        return false; // Assume no duplicate if check fails to avoid blocking creation
    }
}

async function _create_engagement_createEngagement(name, csrfToken) {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const formatDate = (date) => date.toISOString().split('T')[0];

    try {
        const engagementData = {
            name: name,
            target_start: formatDate(today),
            target_end: formatDate(tomorrow),
            lead: 2,
            product: 3,
            status: 'Not Started',
            engagement_type: 'Interactive',
            tags: ['patches']
        };

        const response = await fetch(_create_engagement_api_urls.engagements, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrfToken
            },
            credentials: 'include',
            body: JSON.stringify(engagementData)
        });

        if (!response.ok) {
            throw new Error('Failed to create engagement: ' + response.statusText);
        }
        return true;
    } catch (error) {
        _create_engagement_showToast('Error creating engagement "' + name + '": ' + error.message, 'error');
        return false;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const inputTextarea = document.getElementById('_create_engagement_input');
    const outputTextarea = document.getElementById('_create_engagement_output');
    const fetchButton = document.getElementById('_create_engagement_fetch');
    const createButton = document.getElementById('_create_engagement_create');
    const loadingModal = document.getElementById('_create_engagement_loading_modal');

    // Fetch button: Transform input to comma-separated list with unique names (case-insensitive)
    fetchButton.addEventListener('click', () => {
        const input = inputTextarea.value.trim();
        if (!input) {
            _create_engagement_showToast('Please enter engagement names.', 'error');
            return;
        }

        const names = input.split('\n').map(name => name.trim()).filter(name => name);
        if (names.length === 0) {
            _create_engagement_showToast('No valid names provided.', 'error');
            return;
        }

        // Remove duplicates (case-insensitive)
        const uniqueNames = [...new Set(names.map(name => name.toLowerCase()))].map(lowerName => 
            names.find(name => name.toLowerCase() === lowerName)
        );

        outputTextarea.value = uniqueNames.join(', ');
    });

    // Create button: Create engagements for each name, skipping duplicates
    createButton.addEventListener('click', async () => {
        const namesText = outputTextarea.value.trim();
        if (!namesText) {
            _create_engagement_showToast('Please fetch names first.', 'error');
            return;
        }

        const names = namesText.split(',').map(name => name.trim()).filter(name => name);
        if (names.length === 0) {
            _create_engagement_showToast('No valid names to create.', 'error');
            return;
        }

        // Wait for CSRF token
        const checkCsrfToken = setInterval(async () => {
            if (typeof window.csrfToken !== 'undefined') {
                clearInterval(checkCsrfToken);
                if (window.csrfToken === null) {
                    _create_engagement_showToast('Failed to fetch CSRF token. Cannot create engagements.', 'error');
                    return;
                }

                loadingModal.style.display = 'flex';

                let successCount = 0;
                const skippedNames = [];

                // Check each name individually and create if not a duplicate
                for (const name of names) {
                    const exists = await _create_engagement_checkDuplicate(name);
                    if (exists) {
                        skippedNames.push(name);
                        continue;
                    }

                    const success = await _create_engagement_createEngagement(name, window.csrfToken);
                    if (success) successCount++;
                }

                loadingModal.style.display = 'none';
                let message = `Created ${successCount} out of ${names.length} engagements.`;
                if (skippedNames.length > 0) {
                    message += ` Skipped duplicates: ${skippedNames.join(', ')}.`;
                }
                if (successCount === names.length) {
                    _create_engagement_showToast(message, 'success');
                    inputTextarea.value = '';
                    outputTextarea.value = '';
                } else {
                    _create_engagement_showToast(message, successCount > 0 ? 'success' : 'error');
                }
            }
        }, 100);
    });
});