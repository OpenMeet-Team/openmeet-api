import { Visibility, Status } from 'src/core/constants/constant';

export const groupSeedData = [
  {
    name: '[Published][Public] Tech Innovators',
    description: 'A group for technology enthusiasts and innovators',
    status: Status.Published,
    visibility: Visibility.Public,
    location: 'San Francisco, CA',
    lat: 37.7749,
    lon: -122.4194,
  },
  {
    name: '[Pending][Public] Book Lovers Club',
    description: 'Discussing great literature and sharing book recommendations',
    status: Status.Pending,
    visibility: Visibility.Public,
    location: 'New York, NY',
    lat: 40.7128,
    lon: -74.006,
  },
  {
    name: '[Draft][Public] Fitness Fanatics',
    description: 'For those who love to stay fit and share workout tips',
    status: Status.Draft,
    visibility: Visibility.Public,
    location: 'Los Angeles, CA',
    lat: 34.0522,
    lon: -118.2437,
  },
  {
    name: '[Published][Authenticated] Culinary Explorers',
    description: 'Exploring culinary delights and sharing recipes',
    status: Status.Published,
    visibility: Visibility.Authenticated,
    location: 'Chicago, IL',
    lat: 41.8781,
    lon: -87.6298,
  },
  {
    name: '[Pending][Authenticated] Outdoor Adventurers',
    description: 'Planning and sharing outdoor activities and adventures',
    status: Status.Pending,
    visibility: Visibility.Authenticated,
    location: 'Denver, CO',
    lat: 39.7392,
    lon: -104.9903,
  },
  {
    name: '[Draft][Authenticated] Art Appreciation Society',
    description: 'Discussing and appreciating various forms of art',
    status: Status.Draft,
    visibility: Visibility.Authenticated,
    location: 'Paris, France',
    lat: 48.8566,
    lon: 2.3522,
  },
  {
    name: '[Published][Private] Entrepreneurs Network',
    description:
      'Connecting and supporting aspiring and established entrepreneurs',
    status: Status.Published,
    visibility: Visibility.Private,
    location: 'London, UK',
    lat: 51.5074,
    lon: -0.1278,
  },
  {
    name: '[Pending][Private] Green Earth Initiative',
    description: 'Promoting environmental awareness and sustainable living',
    status: Status.Pending,
    visibility: Visibility.Private,
    location: 'Seattle, WA',
    lat: 47.6062,
    lon: -122.3321,
  },
  {
    name: '[Draft][Private] Photography Enthusiasts',
    description: 'Sharing photography tips, techniques, and amazing shots',
    status: Status.Draft,
    visibility: Visibility.Private,
    location: 'Tokyo, Japan',
    lat: 35.6762,
    lon: 139.6503,
  },
];
