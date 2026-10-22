import Papa from 'papaparse'

export const loadTasksFromCSV = async () => {
  try {
    const response = await fetch('/data/tasks.csv')
    const csvText = await response.text()

    const result = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
    })

    return result.data.map(task => ({
      ...task,
      skills: task.skills ? task.skills.split(';') : [],
    }))
  } catch (error) {
    console.error('Error loading tasks:', error)
    return []
  }
}

export const tasksToCSV = (tasks) => {
  const data = tasks.map(task => ({
    ...task,
    skills: task.skills ? task.skills.join(';') : '',
  }))

  return Papa.unparse(data)
}

// The BOM is what makes Excel open a UTF-8 file with the accents and emoji
// intact instead of as mojibake. Sheets is fine either way.
const saveCSV = (csv, filename) => {
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)

  link.setAttribute('href', url)
  link.setAttribute('download', filename)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export const downloadCSV = (tasks, filename = 'tasks.csv') => {
  saveCSV(tasksToCSV(tasks), filename)
}

// Any screen with a table worth pulling into Sheets or Excel: hand it an array
// of plain objects and Papa works out the header row and the quoting.
export const downloadRowsCSV = (rows, filename) => {
  saveCSV(Papa.unparse(rows), filename)
}

// A file name that sorts by date and says what it came from.
export const csvName = (label) =>
  `${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${new Date().toISOString().slice(0, 10)}.csv`
