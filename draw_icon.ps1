Add-Type -AssemblyName System.Drawing

$sizes = @(192, 512)
foreach ($size in $sizes) {
    $bitmap = New-Object System.Drawing.Bitmap($size, $size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    
    # Background
    $bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(15, 23, 42))
    $graphics.FillRectangle($bgBrush, 0, 0, $size, $size)
    
    # Clock Circle
    $penWidth = [int]($size / 16)
    $circlePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(59, 130, 246), $penWidth)
    $rect = New-Object System.Drawing.Rectangle($penWidth, $penWidth, ($size - 2*$penWidth), ($size - 2*$penWidth))
    $graphics.DrawEllipse($circlePen, $rect)
    
    # Hands
    $center = [int]($size / 2)
    $handPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(16, 185, 129), $penWidth)
    $handPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $handPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    
    $graphics.DrawLine($handPen, $center, $center, $center, [int]($center - ($size / 3)))
    $graphics.DrawLine($handPen, $center, $center, [int]($center + ($size / 4)), [int]($center + ($size / 4)))
    
    # Center dot
    $dotBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $dotSize = [int]($size / 8)
    $graphics.FillEllipse($dotBrush, [int]($center - $dotSize/2), [int]($center - $dotSize/2), $dotSize, $dotSize)
    
    $bitmap.Save("c:\Users\patkl\OneDrive\Desktop\vscode\work-hours-app\icon-$size.png", [System.Drawing.Imaging.ImageFormat]::Png)
    $graphics.Dispose()
    $bitmap.Dispose()
}
