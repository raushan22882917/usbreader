# Screen Documentation: InverterParameterTool

## Screen Overview
The InverterParameterTool screen provides a comprehensive interface for managing inverter parameters through USB communication. The screen features a dark theme with responsive layout that adapts to both portrait and landscape orientations.

## Layout Structure

### 1. Header Section
**Location**: Top of screen
**Background**: Dark gray (#111827) with rounded corners and border

#### Components:
- **Title Row**:
  - "Autonxt Inverter Parameter Tool" title (white, bold, 18px)
  - Connection status badge (green/red with indicator dot)
  
- **Profile Row**:
  - "Profile" label
  - File input field (disabled, shows loaded profile name)
  - "Load JSON" button (blue, primary action)
  
- **JSON Input Area**:
  - Multi-line text input for direct JSON paste
  - Monospace font, 2 lines visible
  - Placeholder text with format example
  
- **Connection Controls Row**:
  - USB device selector (horizontal scrollable buttons)
  - "Scan" button (green, for device discovery)
  - Node ID input (numeric, default "1")
  - "Connect/Disconnect" button (blue/red toggle)
  - "Read" button (ghost style)
  - "Apply" button (ghost style)

### 2. Main Content Area
**Layout**: Two-panel responsive design
**Background**: Dark theme with rounded panels

#### Left Panel - Parameter Groups
**Width**: 25% (landscape) / 30% (portrait)
**Contents**:
- "Parameter Groups" section title
- Search input field (for filtering parameters)
- Scrollable group list:
  - "All" option (always present)
  - Dynamic groups from loaded parameters
  - Selected group highlighted in blue

#### Right Panel - Parameter Table
**Width**: 75% (landscape) / 70% (portrait)
**Contents**:
- "Parameter Comparison" section title
- Horizontally scrollable parameter table with columns:
  - **Code**: Parameter code (e.g., "F01.01")
  - **Name**: Parameter description
  - **File**: File/default value
  - **Current**: Live value from device
  - **Override**: User override value
  - **Final**: Final value (override takes precedence)
  - **Unit**: Measurement unit
  - **Status**: Parameter state indicator
- Table header with column labels
- Scrollable parameter rows with color-coded backgrounds

### 3. Parameter Detail Box
**Location**: Below parameter table
**Background**: Dark blue (#0b1220) with border
**Layout**: Responsive grid (2x2 in portrait, flexible in landscape)

#### Detail Fields:
- Selected Code
- Selected Name  
- File Value
- Current Value
- Override Value
- Final Value

### 4. Manual Override Section
**Location**: Below main content
**Background**: Dark gray panel (#111827)

#### Controls:
- "Manual Override" section title
- Code input field (for parameter code)
- Value input field (numeric)
- "Add" button (blue, primary)
- "Clear" button (ghost style)
- "Write" button (ghost style)

### 5. Status Bar
**Location**: Bottom of scrollable content
**Background**: Dark gray with border
**Content**: Real-time status messages

### 6. Back Button
**Location**: Top-left corner, floating
**Style**: Dark gray with border
**Action**: Returns to previous screen

## Interactive Elements

### USB Device Management
- **Device Buttons**: Horizontal scrollable list, blue when selected
- **Scan Button**: Triggers USB device discovery
- **Connect Button**: Toggles connection state, changes color based on status
- **Node Input**: Numeric input for device node ID

### Parameter Operations
- **Group Selection**: Click to filter parameters by group
- **Parameter Row Selection**: Click to view details and populate override fields
- **Search**: Real-time filtering across all parameter fields
- **Read Button**: Fetch current values from connected device

### JSON Management
- **Load JSON Button**: Opens sidebar for file upload
- **JSON Input Field**: Direct paste area for JSON profiles
- **Parse Operation**: Automatic validation and profile loading

### Override Controls
- **Add Button**: Applies override value to specified parameter
- **Clear Button**: Removes override for specified parameter
- **Write Button**: Sends selected parameter to device
- **Apply Button**: Writes all changed/override parameters

## Visual Design

### Color Scheme
- **Background**: Dark blue (#0b1020)
- **Panels**: Dark gray (#111827)
- **Primary Actions**: Blue (#2563eb)
- **Success States**: Green (#22c55e)
- **Warning States**: Yellow/Orange (#f59e0b)
- **Error States**: Red (#f87171)
- **Text**: Light gray/white (#e5e7eb, #f8fafc)

### Typography
- **Title**: 18px, bold, white
- **Section Titles**: 13px, semibold, light gray
- **Labels**: 12px, light gray
- **Button Text**: 11px, semibold
- **Table Text**: 10px, regular
- **Status Text**: 11px, bold

### Spacing and Layout
- **Panel Margins**: 10px (portrait), 12px (landscape)
- **Panel Padding**: 10-12px
- **Border Radius**: 16px for panels, 10px for inputs/buttons
- **Gap Spacing**: 6-10px between elements
- **Row Heights**: Consistent 6px padding for table rows

## Responsive Behavior

### Portrait Mode
- **Left Panel**: 30% width, minimum 100px
- **Right Panel**: 70% width, minimum 200px
- **Detail Box**: 2x2 grid layout
- **Button Layout**: Vertical stacking when needed

### Landscape Mode
- **Left Panel**: 25% width, maximum 220px
- **Right Panel**: 75% width, minimum 250px
- **Detail Box**: Flexible horizontal layout
- **Button Layout**: Horizontal arrangement preferred

### Screen Size Adaptation
- **Column Widths**: Calculated as percentage of screen width
- **Font Scaling**: Maintains readability across sizes
- **Scrollable Areas**: Table scrolls horizontally when needed
- **Button Sizing**: Adjusts proportionally

## State Indicators

### Connection Status
- **Connected**: Green badge with "● USB Connected"
- **Disconnected**: Red badge with "● Disconnected"
- **Loading**: Overlay with spinner and "Processing..." text

### Parameter Status Colors
- **Same**: Green background (#0f2f1f) - values match
- **Changed**: Yellow background (#3a2f0b) - current differs from file
- **Override**: Blue background (#0f2742) - override applied
- **Pending Read**: Default background (#111827) - no current value

### Loading States
- **USB Operations**: Full-screen overlay with activity indicator
- **Button States**: Disabled during operations
- **Status Messages**: Real-time feedback in status bar

## Sidebar - JSON Loader

### Appearance
- **Position**: Slides in from right, 320px width
- **Background**: Dark gray with left border
- **Header**: Title and close button

### Components
- **File Upload Button**: "📁 Upload File" (green)
- **Load Sample Button**: Pre-configured example data
- **Parse JSON Button**: Process and load the JSON
- **Cancel Button**: Close sidebar without loading
- **Text Area**: Large multi-line input for JSON content

## Error Handling UI

### Alert Dialogs
- **Connection Errors**: "Connection Failed" with error details
- **Parse Errors**: "Parse Error" for invalid JSON
- **Validation Errors**: "Missing Code", "Not Found", etc.
- **File Picker Errors**: Module availability and file access issues

### Visual Feedback
- **Error Messages**: Red text in status bar
- **Validation Highlights**: Border color changes on invalid inputs
- **Disabled States**: Buttons disabled when prerequisites not met

## Accessibility Features

### Screen Reader Support
- **Semantic Labels**: All interactive elements properly labeled
- **Status Announcements**: Connection and operation status announced
- **Table Navigation**: Proper header/row relationships
- **Button Descriptions**: Clear action descriptions

### Visual Accessibility
- **High Contrast**: Dark theme with light text
- **Color Coding**: Supplemental text for color-based status
- **Touch Targets**: Minimum 44px touch targets
- **Font Scaling**: System font size respected

## Performance Considerations

### Rendering Optimization
- **FlatList**: Efficient scrolling for parameter lists
- **Conditional Rendering**: Sidebar only rendered when needed
- **Debounced Search**: Search input debounced for performance
- **Memory Management**: Proper cleanup of USB listeners

### Responsiveness
- **Async Operations**: USB commands don't block UI
- **Loading Indicators**: Clear feedback during operations
- **Error Recovery**: Graceful handling of failed operations
- **State Persistence**: Maintains state during configuration changes

## Platform-Specific Features

### Android
- **File Picker**: Native file selection via FilePickerModule
- **USB Permissions**: Proper USB device access handling
- **Back Button**: Hardware back button handling

### iOS
- **Safe Areas**: Proper SafeAreaView usage
- **Font Rendering**: Platform-specific font families
- **Keyboard Handling**: Proper keyboard avoidance

## Navigation Flow

### Entry
- Arrives from parent screen via onBack prop
- Automatically scans for USB devices
- Initializes with empty parameter state

### Exit
- Back button returns to parent screen
- USB connections properly cleaned up
- State preserved for potential re-entry

### Internal Navigation
- **Sidebar**: Slides in/out for JSON loading
- **Device Selection**: Updates connection state
- **Parameter Selection**: Updates detail view
- **Group Filtering**: Updates parameter display

This comprehensive screen documentation provides complete coverage of the InverterParameterTool's visual design, interactive elements, responsive behavior, and user experience considerations.
