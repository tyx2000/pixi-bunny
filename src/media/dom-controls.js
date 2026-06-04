export function requireElement(id, type = HTMLElement) {
  const element = document.getElementById(id);

  if (!(element instanceof type)) {
    throw new Error(`Required element #${id} was not found.`);
  }

  return element;
}

export function createColorInput(label, value) {
  const input = document.createElement("input");

  input.type = "color";
  input.value = /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000";
  input.ariaLabel = label;

  return input;
}

export function createSelect(label, values, selectedValue) {
  const select = document.createElement("select");

  select.ariaLabel = label;
  values.forEach((value) => {
    const option = document.createElement("option");

    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
  select.value = selectedValue;

  return select;
}

export function createFieldLabel(text, field) {
  const label = document.createElement("label");
  const labelText = document.createElement("span");

  labelText.textContent = text;
  label.append(labelText, field);

  return label;
}
