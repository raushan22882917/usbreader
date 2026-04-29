# Test-By-Answer (TBA) Documentation: InverterParameterTool

## Overview
The InverterParameterTool is a React Native component for managing and configuring inverter parameters through USB communication. It provides a comprehensive interface for loading parameter profiles, reading current values from devices, applying overrides, and writing changes back to the controller.

## Component Architecture

### Core Dependencies
- React Native with SafeAreaView
- Custom DataContext for USB connection management
- USBSerialService for device communication
- Responsive design with useWindowDimensions hook

### Key State Management
- **Connection State**: `isConnected`, `deviceId`, `nodeId`
- **Data State**: `profileData`, `paramRows`, `selectedParam`
- **UI State**: `loading`, `statusMessage`, `jsonSidebarOpen`
- **Filtering**: `currentGroup`, `searchText`
- **Override Management**: `overrideCode`, `overrideValue`

## Test Cases

### 1. Component Initialization
**Question**: Does the component initialize with default values and scan for USB devices?
**Expected Answer**: Yes, the component should:
- Initialize with DEFAULT_PROFILE empty structure
- Set status to "Ready"
- Automatically scan for available USB devices
- Display "Disconnected" status badge
- Show "No USB devices found" if no devices available

### 2. USB Device Management
**Question**: Can users scan, select, and connect to USB devices?
**Expected Answer**: Yes, the component should:
- Display available USB devices as selectable buttons
- Allow device selection with visual feedback (blue highlight)
- Enable Connect button when device is selected
- Show connection status changes in badge
- Display "Connected: USB Device [ID]" on successful connection

### 3. JSON Profile Loading
**Question**: Can users load JSON parameter profiles through multiple methods?
**Expected Answer**: Yes, the component should support:
- **Direct Paste**: JSON input in header text area
- **Sidebar Upload**: File picker for JSON files (Android native module)
- **Sample Data**: Pre-configured sample profile loading
- Parse and validate JSON structure
- Handle both array format and object with parameters array
- Update profile name and parameter count in status

### 4. Parameter Display and Filtering
**Question**: Are parameters displayed correctly with filtering and search capabilities?
**Expected Answer**: Yes, the component should:
- Display parameters in a responsive table with columns: Code, Name, File, Current, Override, Final, Unit, Status
- Show group-based filtering in left panel
- Support real-time search across code, name, group, and values
- Color-code rows based on status (Same=green, Changed=yellow, Override=blue)
- Handle landscape/portrait responsive layouts

### 5. Parameter Status Management
**Question**: Does the component correctly track and display parameter states?
**Expected Answer**: Yes, each parameter should show:
- **Same**: File value equals current value (green background)
- **Changed**: Current value differs from file value (yellow background)
- **Override**: Override value applied (blue background)
- **Pending Read**: No current value available (default background)
- Final value calculation considering overrides

### 6. USB Communication - Read Operations
**Question**: Can the component read current values from the connected device?
**Expected Answer**: Yes, the Read operation should:
- Validate USB connection before reading
- Send read command with all parameter addresses
- Handle hex string encoding/decoding
- Update current values in parameter rows
- Show success message with parameter count
- Handle connection errors gracefully

### 7. USB Communication - Write Operations
**Question**: Can users write parameter changes to the device?
**Expected Answer**: Yes, write operations should:
- Support single parameter write via "Write" button
- Support bulk write via "Apply" button for changed/override parameters
- Validate USB connection before writing
- Send properly formatted write commands
- Show progress indicator during operations
- Read back values after successful write

### 8. Manual Override Management
**Question**: Can users manually override parameter values?
**Expected Answer**: Yes, manual overrides should:
- Accept parameter code and value inputs
- Validate parameter exists in loaded profile
- Update override value and final value calculation
- Clear overrides with "Clear" button
- Show immediate visual feedback in table

### 9. Parameter Selection and Details
**Question**: Does selecting a parameter show detailed information?
**Expected Answer**: Yes, parameter selection should:
- Highlight selected parameter row
- Display detailed information in detail box
- Show code, name, file value, current value, override, final value
- Auto-populate override inputs with selected parameter

### 10. Error Handling and Validation
**Question**: How does the component handle errors and invalid inputs?
**Expected Answer**: The component should:
- Show Alert dialogs for connection failures
- Validate JSON format before parsing
- Check USB connection before operations
- Handle missing parameters gracefully
- Show descriptive error messages
- Validate numeric inputs for values

### 11. Responsive Design
**Question**: Does the component adapt to different screen orientations and sizes?
**Expected Answer**: Yes, the component should:
- Adjust column widths based on screen size
- Reorganize layout for landscape vs portrait
- Maintain functionality on different screen dimensions
- Show horizontal scrolling for parameter table
- Adjust button sizes and spacing

### 12. File Upload (Android)
**Question**: Can users upload JSON files from device storage?
**Expected Answer**: Yes, if FilePickerModule is available:
- Open native file picker for JSON files
- Read file content and populate JSON input
- Show success message with filename
- Handle file picker cancellation gracefully
- Show appropriate error if module not available

### 13. Loading States and Feedback
**Question**: Does the component provide appropriate loading feedback?
**Expected Answer**: Yes, the component should:
- Show loading overlay during USB operations
- Display status messages for all actions
- Update connection status badge in real-time
- Show progress indicators for read/write operations
- Provide clear operation completion feedback

### 14. Data Persistence
**Question**: How does the component manage data during operations?
**Expected Answer**: The component should:
- Maintain parameter data during connection changes
- Preserve override values during read operations
- Keep selected parameter during UI updates
- Store profile data in state
- Handle USB response data correctly

### 15. Node Configuration
**Question**: Can users configure the node ID for communication?
**Expected Answer**: Yes, the component should:
- Allow numeric node ID input
- Use node ID in USB commands
- Default to node 1
- Validate numeric input
- Include node ID in all read/write operations

## Test Data Requirements

### Sample JSON Profile
```json
{
  "profileName": "Test Profile",
  "controller": "AC310",
  "parameters": [
    {
      "code": "F01.01",
      "name": "Run command channel",
      "value": 1,
      "unit": "",
      "group": "F01 Run Control",
      "addr": "0xF001",
      "scale": 1
    },
    {
      "code": "F01.10",
      "name": "Maximum frequency",
      "value": 90,
      "unit": "Hz",
      "group": "F01 Run Control",
      "addr": "0xF010",
      "scale": 0.01
    }
  ]
}
```

### USB Response Format
```json
{
  "status": "ok",
  "seq": 1,
  "params": [
    {
      "addr": "0xF001",
      "val": 1,
      "raw": 1,
      "ok": true
    }
  ],
  "ts": 1234567890
}
```

## Edge Cases to Test

1. **Empty JSON Input**: Handle empty or invalid JSON gracefully
2. **No USB Devices**: Show appropriate message when no devices available
3. **Connection Loss**: Handle USB disconnection during operations
4. **Large Parameter Sets**: Test performance with 100+ parameters
5. **Invalid Parameter Codes**: Handle codes not found in profile
6. **Network Timeouts**: Handle USB communication timeouts
7. **File Picker Unavailable**: Graceful fallback when native module missing
8. **Memory Constraints**: Test with large JSON files
9. **Screen Rotation**: Maintain state during orientation changes
10. **Background/Foreground**: Handle app lifecycle events

## Performance Requirements

- Parameter table scrolling should be smooth with 100+ items
- USB operations should complete within 5 seconds for 50 parameters
- JSON parsing should complete within 1 second for typical profiles
- UI should remain responsive during USB operations
- Memory usage should not exceed 100MB for typical usage

## Accessibility Requirements

- All buttons should have proper labels
- Text should be readable with sufficient contrast
- Table should be navigable with screen readers
- Status messages should be announced
- Form inputs should have proper accessibility labels

## Security Considerations

- USB data should be validated before parsing
- File uploads should be restricted to JSON files
- Input validation for all user inputs
- No sensitive data should be logged
- Proper error handling without information disclosure
