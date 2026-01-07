export function formatDicomDateTime(dicomDate:any, dicomTime:any) {
    // Handle DICOM date format: YYYYMMDD
    const year = dicomDate.slice(0, 4);
    const month = dicomDate.slice(4, 6);
    const day = dicomDate.slice(6, 8);
  
    // Handle DICOM time format: HHMMSS or HHMM
    const hours = dicomTime.slice(0, 2);
    const minutes = dicomTime.slice(2, 4);
  
    const dateObj = new Date(`${year}-${month}-${day}T${hours}:${minutes}:00`);
  
    const formattedDate = dateObj.toLocaleDateString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    }); // e.g., "Jan 01, 2025"
  
    const formattedTime = dateObj.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }); // e.g., "09:42 AM"
  
    // Return formatted string: Jan-01-2025 09:42 AM
    return `${formattedDate.replace(',', '')} ${formattedTime}`;
  }
  
  export function formatDicomDateOnly(dicomDate: string): string {
    if (!dicomDate || dicomDate.length !== 8) {
      return 'Invalid Date';
    }
  
    const year = dicomDate.slice(0, 4);
    const month = dicomDate.slice(4, 6);
    const day = dicomDate.slice(6, 8);
  
    const dateObj = new Date(`${year}-${month}-${day}`);
  
    if (isNaN(dateObj.getTime())) {
      return 'Invalid Date';
    }
  
    return dateObj.toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }); // e.g., "3 Jan 2025"
  }
  
  export async function loadVolume(imageData) {
    // Implement your volume loading logic here
    // This typically involves creating a volume from the image data
    // and adding it to the volume cache
    return {
      volumeId: 'mprVolume',
      // ... other volume properties
    };
  }