// Tiny stand-in for the eleven generators OpenCloak pulls from @faker-js/faker.
//
// Curated English lists + format printers, no dependencies. The point is realism
// the model will treat as ordinary text (census-style names, US phone shapes),
// not syllable soup — and a bundle measured in kilobytes rather than half a
// megabyte of locale data we never read.

const FIRST = [
  "James", "Mary", "John", "Patricia", "Robert", "Jennifer", "Michael", "Linda",
  "William", "Elizabeth", "David", "Barbara", "Richard", "Susan", "Joseph",
  "Jessica", "Thomas", "Sarah", "Charles", "Karen", "Christopher", "Nancy",
  "Daniel", "Lisa", "Matthew", "Betty", "Anthony", "Margaret", "Mark", "Sandra",
  "Donald", "Ashley", "Steven", "Kimberly", "Paul", "Emily", "Andrew", "Donna",
  "Joshua", "Michelle", "Kenneth", "Dorothy", "Kevin", "Carol", "Brian",
  "Amanda", "George", "Melissa", "Timothy", "Deborah", "Ronald", "Stephanie",
  "Edward", "Rebecca", "Jason", "Sharon", "Jeffrey", "Laura", "Ryan", "Cynthia",
  "Jacob", "Kathleen", "Gary", "Amy", "Nicholas", "Angela", "Eric", "Shirley",
  "Jonathan", "Anna", "Stephen", "Brenda", "Larry", "Pamela", "Justin", "Emma",
  "Scott", "Nicole", "Brandon", "Helen", "Benjamin", "Samantha", "Samuel",
  "Katherine", "Raymond", "Christine", "Gregory", "Debra", "Frank", "Rachel",
  "Alexander", "Carolyn", "Patrick", "Janet", "Jack", "Catherine", "Dennis",
  "Maria", "Jerry", "Heather", "Tyler", "Diane", "Aaron", "Ruth", "Jose",
  "Julie", "Adam", "Olivia", "Henry", "Joyce", "Nathan", "Virginia", "Zachary",
  "Victoria", "Douglas", "Kelly", "Peter", "Lauren", "Kyle", "Christina",
  "Noah", "Joan", "Ethan", "Evelyn", "Jeremy", "Judith", "Walter", "Megan",
  "Christian", "Andrea", "Keith", "Cheryl", "Roger", "Hannah", "Terry",
  "Jacqueline", "Austin", "Martha", "Sean", "Gloria", "Gerald", "Teresa",
  "Carl", "Ann", "Dylan", "Sara", "Harold", "Madison", "Jordan", "Frances",
  "Jesse", "Kathryn", "Bryan", "Janice", "Billy", "Jean", "Bruce", "Abigail",
  "Gabriel", "Alice", "Joe", "Judy", "Logan", "Sophia", "Alan", "Grace",
  "Juan", "Denise", "Wayne", "Amber", "Elijah", "Doris", "Randy", "Marilyn",
  "Roy", "Danielle", "Vincent", "Beverly", "Ralph", "Isabella", "Eugene",
  "Theresa", "Russell", "Diana", "Bobby", "Natalie", "Mason", "Brittany",
  "Philip", "Charlotte", "Louis", "Marie", "Johnny", "Kayla", "Alex",
  "Jordan", "Taylor", "Morgan", "Casey", "Riley", "Avery", "Quinn",
] as const;

const LAST = [
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller",
  "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez",
  "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin",
  "Lee", "Perez", "Thompson", "White", "Harris", "Sanchez", "Clark",
  "Ramirez", "Lewis", "Robinson", "Walker", "Young", "Allen", "King",
  "Wright", "Scott", "Torres", "Nguyen", "Hill", "Flores", "Green", "Adams",
  "Nelson", "Baker", "Hall", "Rivera", "Campbell", "Mitchell", "Carter",
  "Roberts", "Gomez", "Phillips", "Evans", "Turner", "Diaz", "Parker",
  "Cruz", "Edwards", "Collins", "Reyes", "Stewart", "Morris", "Morales",
  "Murphy", "Cook", "Rogers", "Gutierrez", "Ortiz", "Morgan", "Cooper",
  "Peterson", "Bailey", "Reed", "Kelly", "Howard", "Ramos", "Kim", "Cox",
  "Ward", "Richardson", "Watson", "Brooks", "Chavez", "Wood", "James",
  "Bennett", "Gray", "Mendoza", "Ruiz", "Hughes", "Price", "Alvarez",
  "Castillo", "Sanders", "Patel", "Myers", "Long", "Ross", "Foster",
  "Jimenez", "Rath", "Barnes", "Fisher", "Henderson", "Coleman", "Jenkins",
] as const;

const STREETS = [
  "Main", "Oak", "Pine", "Maple", "Cedar", "Elm", "Washington", "Lake",
  "Hill", "Park", "River", "Sunset", "Willow", "Walnut", "Highland",
  "Madison", "Jackson", "Lincoln", "Franklin", "Church", "School", "Market",
  "Spring", "North", "South", "West", "East", "Center", "Union", "College",
  "Valley", "Mill", "Bridge", "Meadow", "Forest", "Garden", "Ridge",
  "Summit", "View", "Shore", "Cherry", "Dogwood", "Birch", "Aspen",
] as const;

const SUFFIXES = ["St", "Ave", "Rd", "Blvd", "Ln", "Dr", "Ct", "Way", "Pl", "Ter"] as const;

const DOMAINS = [
  "example.com",
  "example.org",
  "example.net",
  "mail.test",
  "inbox.test",
] as const;

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)]!;
}

function digits(count: number): string {
  let out = "";
  for (let index = 0; index < count; index += 1) {
    out += Math.floor(Math.random() * 10);
  }
  return out;
}

function firstName(): string {
  return pick(FIRST);
}

function middleName(): string {
  return pick(FIRST);
}

function lastName(): string {
  return pick(LAST);
}

function buildingNumber(): string {
  return String(1 + Math.floor(Math.random() * 9998));
}

function street(): string {
  return `${pick(STREETS)} ${pick(SUFFIXES)}`;
}

function email(): string {
  const local = `${firstName()}.${lastName()}${digits(2)}`.toLowerCase();
  return `${local}@${pick(DOMAINS)}`;
}

/** US national shape, matching OpenCloak's `style: "national"`. */
function phone(): string {
  // Avoid 0/1 as the area-code leading digit — those are not assignable NANP codes.
  const area = String(2 + Math.floor(Math.random() * 8)) + digits(2);
  const exchange = String(2 + Math.floor(Math.random() * 8)) + digits(2);
  return `(${area}) ${exchange}-${digits(4)}`;
}

function dateOfBirth(): string {
  const month = 1 + Math.floor(Math.random() * 12);
  const day = 1 + Math.floor(Math.random() * 28);
  const year = 1950 + Math.floor(Math.random() * 55);
  return `${month}/${day}/${year}`;
}

function ssn(): string {
  return `${digits(3)}-${digits(2)}-${digits(4)}`;
}

function card(): string {
  return `${digits(4)}-${digits(4)}-${digits(4)}-${digits(4)}`;
}

function ipv4(): string {
  return [0, 1, 2, 3].map(() => Math.floor(Math.random() * 256)).join(".");
}

/** The eleven kinds OpenCloak's GENERATE table uses. */
export type PiiKind =
  | "first name"
  | "middle name"
  | "last name"
  | "building no."
  | "street"
  | "email"
  | "phone"
  | "date of birth"
  | "ssn"
  | "card"
  | "ip address";

/** Kind → generator, same keys OpenCloak's GENERATE table uses. */
export const GENERATE: Record<PiiKind, () => string> = {
  "first name": firstName,
  "middle name": middleName,
  "last name": lastName,
  "building no.": buildingNumber,
  street,
  email,
  phone,
  "date of birth": dateOfBirth,
  ssn,
  card,
  "ip address": ipv4,
};
