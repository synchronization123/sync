import pandas as pd

# Load the Excel file
file_path = 'abc.xlsx'  # File in current directory
df = pd.read_excel(file_path)

# Ensure columns A, D, and E exist (Excel columns are 1-based, pandas is 0-based)
col_a = 'A'  # File names
col_d = 'D'  # Paragraphs
col_e = 'E'  # Jira IDs
col_b = 'B'  # Output column for Jira IDs

# Initialize Column B with empty strings
df[col_b] = ''

# Iterate through each row
for index, row in df.iterrows():
    file_name = str(row[col_a])  # Get file name from Column A
    paragraph = str(row[col_d])   # Get paragraph from Column D
    
    # Check if file name (or its base name) appears in the paragraph
    # Extract base name (e.g., 'hsjd.jsp' from '/javascript/abc/hsjd.jsp')
    base_name = file_name.split('/')[-1]
    if file_name in paragraph or base_name in paragraph:
        # If match found, copy Jira ID from Column E to Column B
        df.at[index, col_b] = row[col_e]

# Save the updated DataFrame back to the Excel file
df.to_excel('abc_updated.xlsx', index=False)
print("Processing complete. Output saved to 'abc_updated.xlsx'.")