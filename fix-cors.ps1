# PowerShell script to fix all getCorsHeaders() calls

$functionsDir = "c:\Users\FUJITSU\Downloads\playreadysports-main\playreadysports-main\backend\supabase\functions"

Get-ChildItem -Path $functionsDir -Recurse -Filter "index.ts" | ForEach-Object {
    $filePath = $_.FullName
    $content = Get-Content $filePath -Raw
    
    # Check if this is an edge function (has Deno.serve)
    if ($content.Contains("Deno.serve")) {
        # Check if it already has requestOrigin
        if ($content.Contains("const requestOrigin = req.headers.get")) {
            # Replace all getCorsHeaders() calls (without parameter) with getCorsHeaders(requestOrigin)
            $newContent = $content.Replace("getCorsHeaders()", "getCorsHeaders(requestOrigin)")
            
            # Save the file
            Set-Content -Path $filePath -Value $newContent -Encoding UTF8
            Write-Host "✓ Fixed: $($_.Directory.Name)"
        }
    }
}

Write-Host "All functions fixed!"
